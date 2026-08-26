// evolutionLayer.js
//
// The first prestige layer. Give up everything that grows, get evolution points for them.
// The cores tree, pond upgrades, and land upgrades all stay, while algae, fish, grass, and rain
// return to nothing. Map goes back to one tile in the middle.
// Sub-layers: Evolve is the button for it, cards are what the points are spent on.

import { registerLayer } from "../../core/registry.js";
import { getLayerState } from "../../core/state.js";
import { addResource, canAfford, spend } from "../../core/resources.js";
import { boostResource } from "../../core/boosts.js";
import { D } from "../../utils/decimal.js";
import { formatNumber, formatWhole } from "../../utils/format.js";
import { matureTiles, grassTiles, ORIGIN_TILE } from "./worldMap.js";

import {
    CARDS, SLOTS, COPIES_TO_COMBINE, collection, cardEntry, cardName, cardArt, rarityOf, knownCard,
    comboStatus, rollDraw, collectCard, equipCard, unequipSlot, firstFreeSlot,
    BANNERS, BANNER_IDS, bannerArt, bannerUnlocked, unlockedBannerIds,
    loadoutLocked, lockLoadout, releaseLoadout,
} from "./cards.js";

// One point per tile grown all the way to mature. Partly-grown tiles count for nothing.
// THIS WILL BE CHANGED. SOON.
const POINTS_PER_MATURE_TILE = D(2);

const DRAW_BASE_COST = D(5);      // For a draw that names no banner, which only an old save can
const DRAW_COST_SCALE = D(1.2);   // Per draw already taken on that banner

let armEvo = false; // For when you reset but won't gain any points

// THIS NEEDS TO CHANGE A LOT
// needs to factor in the other tiles
// but since they only reset the growth and state of them and not the tile itself
// this is gonna be complicated
export const pointsOnEvolve = () => POINTS_PER_MATURE_TILE
    .mul(matureTiles(getLayerState("world")).length)
    .mul(boostResource("evolutionPoints"));

// Each banner scales its price separately based on how many cards you've drawn from it.
const bannerDraws = (s, banner = s.banner) => (s.bannerDraws || {})[banner] || 0;

// Costs are rounded to whole numbers.
const costOf = (banner, draws) =>
    D(BANNERS[banner] ? BANNERS[banner].baseCost : DRAW_BASE_COST)
        .mul(DRAW_COST_SCALE.pow(draws)).ceil();

const drawCost = (s) => ({ evolutionPoints: costOf(s.banner, bannerDraws(s)) });

// The ground an evolution takes back: grass, whatever the weather left lying around, and the
// ponds that fills. Everything built up past those is the world's to keep.
const RESET_TERRAIN = new Set(["water", "snow", "pond"]);

// The actual reset. Rests growing things, and map size.
function resetLivingThings() {
    // Pond
    const pond = getLayerState("pond");
    pond.algae = 0;
    pond.fish = 0;
    pond.turbulence = 0;
    pond.algaeSurge = 0;
    pond.algaeSurgeReady = 0;
    pond.fishSurge = 0;
    pond.fishSurgeReady = 0;

    const world = getLayerState("world");
    //world.tiles = { [ORIGIN_TILE]: true };
    world.grass = {};
    world.terrain = Object.fromEntries(Object.entries(world.terrain || {})
        .filter(([, kind]) => !RESET_TERRAIN.has(kind)));

    // Resets precipitation and buildup
    world.moisture = {};
    world.snowpack = {};
    world.weatherSeconds = 0;
    world.weatherTotal = 0;
    world.weatherTile = null;
    world.weatherPower = 0;
    world.weatherSoak = 0;

    // The cloud itself, which is charge that was paid for and doesn't survive the reset either.
    const cloud = getLayerState("precipitation");
    cloud.charge = 0;
    cloud.stability = 1;

    world.selectedTile = null;
    world.transformFodder = [];
}

registerLayer("evolution", {
    categoryId: "main",
    group: "beyond",
    name: "Evolution",
    color: "#b06ad0",
    order: 0,
    startUnlocked: false, // the Evolution node on the Cores tree unlocks it

    resources: {
        evolutionPoints: { name: "Evolution", color: "#b06ad0" },
    },

    initialState: {
        cards: {},                              // { id: { level, copies } }
        equipped: new Array(SLOTS).fill(null),
        draw: null,                             // Three card ids waiting to be chosen between.
        draws: 0,                               // Lifetime draws, across every banner.
        unlockedCards: [],                      // Locked cards that something has opened up.
        banner: null,                           // Which pool you're drawing from, null = picking one.
        bannerDraws: {},                        // Draws per banner, which is what prices the next one.
        loadoutLocked: false,                   // Equipped cards do nothing until locked in, and stay locked in for the evolution.
    },

    subLayers: {
        evolve: {
            name: "Evolve",
            canvasType: "static",
            order: 0,

            scene: {
                build(el, s, layer) {
                    el.className = "static-scene evolution-scene";
                    el.innerHTML = `
                        <div class="evolve-panel">
                            <button class="evolve-button">
                                <span class="evolve-verb">Evolve</span>
                                <span class="evolve-gain"></span>
                            </button>
                            <div class="evolve-note"></div>
                            <div class="evolve-terms">
                                <div class="evolve-keeps"><b>Kept:</b> the Cores tree, Pond upgrades,
                                    Grass upgrades, and your collection of cards.</div>
                                <div class="evolve-loses"><b>Reset:</b> Algae, fish, grass, and the
                                    ground the weather leaves - water, snow, and ponds. Anything built up
                                    past those is kept. Life needs to be sown again, with cards to lock in
                                    and a grass to choose before the first seed is planted.</div>
                            </div>
                        </div>
                    `;
                    
                    addEventListener("click", (e) => { if (e.target != el.querySelector(".evolve-button")) armEvo = false; });
                    el.querySelector(".evolve-button").addEventListener("click", () => {
                        const gain = pointsOnEvolve();
                        if (gain.gte(6) || !!getLayerState("cores").purchasedUpgrades.environment) {
                            if (!armEvo && gain.eq(0)) {
                                armEvo = true;
                                setText(el.querySelector(".evolve-gain"), "Are you sure? You will gain 0 evolution points.");
                                return;
                            }
                        addResource(layer, "evolutionPoints", gain);
                        resetLivingThings();
                        releaseLoadout();
                        armEvo = false;
                        }

                        return;
                    });
                },

                update(el) {
                    const world = getLayerState("world");
                    const mature = matureTiles(world).length;
                    const gain = pointsOnEvolve();

                    // Rounds instead of having decimals
                    if (!armEvo) { setText(el.querySelector(".evolve-gain"), `+${formatNumber(gain, 0)}`)};
                    el.querySelector(".evolve-button").classList.toggle("ready", gain.gt(6));

                    const growing = grassTiles(world).length - mature;
                    setText(el.querySelector(".evolve-note"),
                        gain.lte(6) && !getLayerState("cores").purchasedUpgrades.environment
                            ? "Not enough biomass to evolve..."
                            : `${mature} mature tile${mature === 1 ? "" : "s"}`
                                + (growing > 0 ? `, and ${growing} still growing.` : "."));
                },
            },
        },

        cards: {
            name: "Cards",
            canvasType: "static",
            order: 1,

            scene: {
                build(el, s, layer) {
                    el.className = "static-scene cards-scene";
                    el.innerHTML = `
                        <div class="cards-page">
                            <div class="cards-stage">
                                <div class="cards-draw"></div>
                            </div>
                            <div class="cards-lower">
                                <div class="cards-section">
                                    <div class="cards-heading">Equipped <span class="cards-sub"></span></div>
                                    <div class="cards-slots"></div>
                                    <div class="cards-lockin"></div>
                                    <div class="cards-combos"></div>
                                </div>
                                <div class="cards-section">
                                    <div class="cards-heading">Collection</div>
                                    <div class="cards-collection"></div>
                                </div>
                            </div>
                        </div>
                    `;
                    // Not rebuilt every frame
                    el.__signature = null;
                    // What draw has already been dealt
                    el.__dealt = null;
                },

                update(el, s, layer) {
                    // The open banners are in here too, so a layer unlocked while this page is
                    // up brings its banner in rather than waiting for the next change.
                    const signature = JSON.stringify([s.cards, s.equipped, s.draw, s.banner,
                                                      s.bannerDraws, s.unlockedCards, s.loadoutLocked,
                                                      unlockedBannerIds()]);
                    if (el.__signature !== signature) {
                        el.__signature = signature;
                        buildSlots(el, s);
                        buildLockIn(el, s);
                        buildCollection(el, s);
                        buildCombos(el, s);
                        buildStage(el, s, layer);
                        el.__needsFit = true;
                    }

                    // Sizing the words to the card on the first render after the tab is opened.
                    // The flavor text kept making the card art run off the card.
                    if (el.__needsFit) el.__needsFit = !fitCardText(el);

                    const button = el.querySelector(".draw-button");
                    if (button) button.classList.toggle("unaffordable", !canAfford(layer, drawCost(s)));
                },
            },
        },
    },
});

// Cards page components

// Defining the face of a card
function cardFace(id, entry, extra = "") {
    // Empty for an id not in the pool, e.g. a removed or changed card.
    if (!knownCard(id)) return "";

    const card = CARDS[id];
    const rarity = rarityOf(id);
    const level = entry ? entry.level : 1;
    // data-fit names what's in the body, so it can remember the answer for a card it
    // has already sized rather than measuring it again every rebuild.
    return `
        <div class="card-face rarity-${card.rarity} ${extra}"
             style="--card-color: ${card.color}; --rarity-color: ${rarity.color}">
            <div class="card-art">${cardArt(id)}</div>
            <div class="card-body" data-fit="${id}:${entry ? level : 0}">
                <div class="card-name">${entry ? cardName(id, level) : card.name}</div>
                <div class="card-effect">${effectText(id, level)}</div>
                <div class="card-text">${card.text}</div>
            </div>
            <div class="card-foot">
                <span class="card-rarity">${rarity.name}</span>
                ${entry ? `<span class="card-copies" title="Copies toward the next level">${entry.copies}/${COPIES_TO_COMBINE}</span>` : ""}
            </div>
        </div>
    `;
}


// When the text gets too big to fit on the card properly, it resizes it. Text size is in stages
// rather than independent so it makes the sizing look consistent.
const FIT_STEPS = [1, 0.92, 0.85, 0.78, 0.72];

// What size a given card was last time.
const fitCache = new Map();

// Returns false if nothing could be measured.
function fitCardText(root) {
    const bodies = root.querySelectorAll(".card-body");
    let measured = false;

    for (const body of bodies) {
        // Height of zero means the tab isn't showing.
        if (body.clientHeight === 0) continue;
        measured = true;

        const key = `${body.dataset.fit}@${Math.round(body.clientWidth)}`;
        const known = fitCache.get(key);
        if (known !== undefined) {
            body.style.setProperty("--card-text-scale", known);
            continue;
        }

        // Goes down through the sizes until the content of the card fits.
        let scale = FIT_STEPS[FIT_STEPS.length - 1];
        for (const step of FIT_STEPS) {
            body.style.setProperty("--card-text-scale", step);
            if (body.scrollHeight <= body.clientHeight) { scale = step; break; }
        }
        body.style.setProperty("--card-text-scale", scale);
        fitCache.set(key, scale);
    }

    return measured;
}

// What each mod is called on a card. Key with no entry falls back to its name.
// Prefix of "-" when combined cards are better the smaller it gets instead of bigger.
const MOD_NAMES = {
    // Cores
    coreGrowth: "Green Core growth speed",
    greenProduction: "Green Essence production",
    chargeRate: "Blue Core charge speed",
    blueClick: "Blue Essence per click",
    fullChargeBonus: "full-charge click bonus",
    chargeCapacity: "charge capacity",
    growthNeeded: "-growth needed per stage",
    stageCap: "growth stage cap",

    // Pond
    pondOutput: "Pond output",
    algaeGrowth: "algae growth",
    fishGrowth: "fish growth",
    algaeGreen: "Green Essence from algae",
    fishBlue: "Blue Essence from fish",
    stirPower: "turbulence per click",
    settleResist: "-how fast water settles",
    turbulenceMax: "maximum turbulence",
    roughFish: "fish growth in rough water",
    calmAlgae: "algae growth in calm water",
    pondCapacity: "Pond capacity",
    biomassOutput: "Biomass production",
    biomassExponent: "Biomass exponent",
    algaeFullGreen: "Green Essence while the Pond is packed with algae",

    // Grass
    grassGrowth: "grass growth",
    grassOutput: "grass output",
    adjacencyBonus: "bonus per adjacent grassy tile",
    matureWait: "-wait before mature grass spreads",

    // Rain
    rainDuration: "how long weather lasts",
    rainBoost: "what a cloud is worth to the tile under it",
    rainCharge: "how fast the cloud gathers",
    rainCost: "-Blue Essence to fill the cloud",
    moistureRate: "how much weather leaves in the ground",
    rainSoak: "rain on ground with nothing growing on it",
};

function effectText(id, level) {
    const card = CARDS[id];
    if (card.effect) return card.effect;

    const flat = card.modsFlat || {};
    const keys = new Set([...Object.keys(card.mods || {}), ...Object.keys(flat)]);

    return [...keys].map(key => {
        const value = (card.mods?.[key] || 0) * (1 + ((level-1)/3)) + (flat[key] || 0);
        const name = MOD_NAMES[key] || key;
        // The leading "-" belongs to the name instead of the number, "-5% cost" reads better than "+5% -cost".
        return name.startsWith("-")
            ? `-${Math.round(value * 100)}% ${name.slice(1)}`
            : `+${Math.round(value * 100)}% ${name}`;
    }).join(", ");
}


// Top half of the page. Has banners to pick between, or the banner you picked + draw button / dealt cards
function buildStage(el, s, layer) {
    const host = el.querySelector(".cards-draw");
    host.innerHTML = "";

    // A banner is only open while its layer is, so a closed one drops you back to the choice.
    if (s.banner && !bannerUnlocked(s.banner)) s.banner = null;

    if (!s.banner && !s.draw) return buildBannerChoice(host, s);

    if (s.banner) {
        host.appendChild(backBar(s));
        host.appendChild(bannerHero(s));
    }

    const body = document.createElement("div");
    body.className = "draw-body";
    host.appendChild(body);
    buildDraw(body, el, s, layer);
}

// Return button to go back to banner selection
function backBar(s) {
    const bar = document.createElement("div");
    bar.className = "banner-bar";

    const back = document.createElement("button");
    back.className = "banner-back";
    back.innerHTML = `<span aria-hidden="true">&#8592;</span> All banners`;
    if (s.draw) {
        back.disabled = true;
        back.title = "Choose one of the cards first.";
    } else {
        back.addEventListener("click", () => { s.banner = null; });
    }

    bar.appendChild(back);
    return bar;
}

// The banner choices. This makes them look good.
function buildBannerChoice(host, s) {
    const wrap = document.createElement("div");
    wrap.className = "banner-choice";
    wrap.innerHTML = `<div class="cards-heading">Draw from</div>`;

    const grid = document.createElement("div");
    grid.className = "banner-grid";

    // A banner whose layer isn't open is left out entirely - naming it would give away
    // something that hasn't been found yet.
    for (const id of BANNER_IDS) {
        if (!bannerUnlocked(id)) continue;
        const banner = BANNERS[id];
        const btn = document.createElement("button");
        btn.className = "banner-card";
        btn.style.setProperty("--banner-color", banner.color);
        btn.innerHTML = `
            <div class="banner-icon">${bannerArt(id)}</div>
            <div class="banner-info">
                <div class="banner-name">${banner.name}</div>
                <div class="banner-text">${banner.text}</div>
            </div>
            <div class="banner-price">${formatWhole(costOf(id, bannerDraws(s, id)))}</div>
        `;
        btn.addEventListener("click", () => { s.banner = id; });
        grid.appendChild(btn);
    }

    wrap.appendChild(grid);
    host.appendChild(wrap);
}

// The banner you're on, across the top of the stage.
function bannerHero(s) {
    const banner = BANNERS[s.banner];
    const hero = document.createElement("div");
    hero.className = "banner-hero";
    hero.style.setProperty("--banner-color", banner.color);
    hero.innerHTML = `
        <div class="banner-icon">${bannerArt(s.banner)}</div>
        <div class="banner-info">
            <div class="banner-name">${banner.name}</div>
            <div class="banner-text">${banner.text}</div>
        </div>
    `;
    return hero;
}

function buildDraw(host, el, s, layer) {
    // Pending draw is held in the save so you don't lose the evo points without getting a card
    collection(s);
    const offered = (s.draw || []).filter(knownCard);
    if (s.draw && offered.length === 0) s.draw = null;

    if (s.draw) {
        const choices = document.createElement("div");
        choices.className = "draw-choices";
        choices.innerHTML = `<div class="cards-heading">Choose one</div>`;
        const row = document.createElement("div");
        const key = offered.join(",");
        row.className = el.__dealt === key ? "draw-row" : "draw-row dealing";
        el.__dealt = key;
        for (const id of offered) {
            const btn = document.createElement("button");
            btn.className = "draw-choice";
            btn.innerHTML = cardFace(id, null);
            btn.addEventListener("click", () => {
                collectCard(id, s);
                s.draw = null;
                // The draw goes into a free slot if there is one, and if the loadout is still
                // open - a card drawn mid-evolution waits for the next one.
                const free = firstFreeSlot(s);
                if (free !== -1 && !loadoutLocked(s)) equipCard(id, free, s);
            });
            row.appendChild(btn);
        }
        choices.appendChild(row);
        host.appendChild(choices);
        return;
    }

    el.__dealt = null;   // The next draw deals itself out

    const cost = drawCost(s);
    const btn = document.createElement("button");
    btn.className = "draw-button";
    btn.innerHTML = `<span class="draw-verb">Draw</span>`
        + `<span class="draw-cost">${formatWhole(cost.evolutionPoints)} Evolution</span>`;
    btn.addEventListener("click", () => {
        const rolled = rollDraw(s.banner);
        if (rolled.length === 0) return;
        if (!spend(layer, drawCost(s))) return;

        s.draws = (s.draws || 0) + 1;
        if (!s.bannerDraws) s.bannerDraws = {};
        s.bannerDraws[s.banner] = bannerDraws(s) + 1;
        s.draw = rolled;
    });
    host.appendChild(btn);
}

function buildSlots(el, s) {
    const host = el.querySelector(".cards-slots");
    host.innerHTML = "";
    collection(s);
    setText(el.querySelector(".cards-sub"), `${(s.equipped || []).filter(Boolean).length}/${SLOTS}`);

    const locked = loadoutLocked(s);
    for (let slot = 0; slot < SLOTS; slot++) {
        const stored = (s.equipped || [])[slot];
        const id = knownCard(stored) ? stored : null;
        const box = document.createElement("button");
        box.className = `card-slot${id ? " filled" : ""}${locked ? " locked" : ""}`;
        box.innerHTML = id ? cardFace(id, cardEntry(id, s), "in-slot") : `<span class="slot-empty">${locked ? "Left empty" : "Empty"}</span>`;
        if (id && !locked) box.addEventListener("click", () => unequipSlot(slot, s));
        host.appendChild(box);
    }
}

// The one commitment on this page. Until it is made the equipped cards are worth nothing, and
// once it is made they are the run's cards until the next evolution.
function buildLockIn(el, s) {
    const host = el.querySelector(".cards-lockin");
    host.innerHTML = "";

    if (loadoutLocked(s)) {
        host.className = "cards-lockin locked";
        host.innerHTML = `<span class="lockin-state">Locked in for this evolution.</span>`
            + `<span class="lockin-note">Evolving is what frees them again.</span>`;
        return;
    }

    host.className = "cards-lockin";
    const equipped = (s.equipped || []).filter(Boolean).length;

    const btn = document.createElement("button");
    btn.className = "lockin-button";
    btn.textContent = "Lock in for this evolution";
    btn.disabled = equipped === 0;
    btn.addEventListener("click", () => lockLoadout(s));

    const note = document.createElement("span");
    note.className = "lockin-note";
    note.textContent = equipped === 0
        ? "Equip a card first. Cards do nothing until they are locked in."
        : "Swap them freely. They do nothing until they are locked in.";

    host.append(btn, note);
}

const levelOf = (id, s) => (cardEntry(id, s) || { level: 1 }).level;

// The collection, split by banner and each is sorted by descending rarity.
function buildCollection(el, s) {
    const host = el.querySelector(".cards-collection");
    host.innerHTML = "";

    const owned = Object.keys(collection(s));
    if (owned.length === 0) {
        host.innerHTML = `<div class="cards-empty">No cards yet. Draw one with Evolution points.</div>`;
        return;
    }

    const sections = [...BANNER_IDS, null];
    for (const bannerId of sections) {
        const inSection = owned.filter(id => (BANNERS[CARDS[id].banner] ? CARDS[id].banner : null) === bannerId);
        if (inSection.length === 0) continue;

        // Rarest first, then the higher level, then by name.
        inSection.sort((a, b) =>
            rarityOf(a).weight - rarityOf(b).weight
            || levelOf(b, s) - levelOf(a, s)
            || CARDS[a].name.localeCompare(CARDS[b].name));

        const banner = BANNERS[bannerId];
        const group = document.createElement("div");
        group.className = "collection-group";
        if (banner) group.style.setProperty("--banner-color", banner.color);
        group.innerHTML = `<div class="collection-group-name">${banner ? banner.name : "Other"}
            <span class="collection-count">${inSection.length}</span></div>`;

        const row = document.createElement("div");
        row.className = "collection-row";
        for (const id of inSection) row.appendChild(collectionCard(id, s));
        group.appendChild(row);
        host.appendChild(group);
    }
}

function collectionCard(id, s) {
    const equipped = (s.equipped || []).includes(id);
    const locked = loadoutLocked(s);
    const btn = document.createElement("button");
    btn.className = `collection-card${equipped ? " equipped" : ""}${locked ? " locked" : ""}`;
    btn.innerHTML = cardFace(id, cardEntry(id, s));
    btn.addEventListener("click", () => {
        if (equipped || locked) return;
        // Into the first free slot, or over the first slot if they're all taken.
        const free = firstFreeSlot(s);
        equipCard(id, free === -1 ? 0 : free, s);
    });
    return btn;
}

// Combos. A two-card combo that's folded into a three-card combo is greyed out.
function buildCombos(el, s) {
    const host = el.querySelector(".cards-combos");
    const status = comboStatus(s);

    host.innerHTML = status.length === 0 ? "" : status.map(({ combo, foldedInto }) => `
        <div class="combo-tag${majorCombo(combo) ? " major" : ""}${foldedInto ? " folded" : ""}"
             title="${combo.text}">
            <b>${combo.name}</b>
            <span class="combo-effect">${foldedInto
                ? `folded into ${foldedInto.name}`
                : comboEffect(combo)}</span>
        </div>
    `).join("");
}

// Card combos that take your whole equipped loadout. Might change when more slots are added, idk
const majorCombo = (combo) => combo.cards.length >= SLOTS;

// Same as cards, if a specific effect is listed then it goes off that
const comboEffect = (combo) => combo.effect || Object.entries(combo.mods || {})
    .map(([key, value]) => `+${Math.round(value * 100)}% ${MOD_NAMES[key] || key}`).join(", ");

function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
}
