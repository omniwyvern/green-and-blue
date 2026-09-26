// language.js
//
// Every settlement's own tongue: its words, the scenes they're overheard in, and working out what they mean

import { getLayerState, layerUnlocked, unlockLayer } from "../../../core/state.js";
import { seededRandom, hashText } from "../../../utils/math.js";
import { settlements, addEffectSource } from "./settlements.js";
import { NOTIONS, innovated, notionKnown } from "./knowledge.js";

const languageState = () => getLayerState("language");

export function checkLanguage() {
    if (!layerUnlocked("language") && innovated("language")) unlockLayer("language");
}


//    !!! STAGES !!!

// Reached in order: need is how many of the stage's own words have to be known, plus every one of words.
// Effects are in the same shape as a project's; unlocks are for other content to ask about with speaks()
export const SPEECH_STAGES = {
    basic:       { name: "First Words", need: 14, limit: 35,
                   text: "" },
    daily:       { name: "Everyday Speech", need: 14, limit: 40, mods: { food: 0.1 },
                   text: "More people can live together, enough for a village" },
    abstract:    { name: "Abstract Speech", need: 15, words: ["person", "command", "not", "far", "tomorrow", "leader", "name", "life", "death"], unlocks: ["leaders"],
                   text: "Even more people can live together, +10% food from every job" },
    specialized: { name: "Specialized Speech", need: 8, mods: { food: 0.1 },
                   text: "+10% food from every job (placeholder)" },
                   // next one    Words for skilled work, so what one person works out can be taught to the rest
};
export const SPEECH_IDS = Object.keys(SPEECH_STAGES);


//    !!! CONCEPTS !!!

// A concept without parts is a root, one syllable. Anything else is its parts' words run together,
// so the simpler a thing is, the shorter its word. A concept's parts can't come from a later stage.
// notion keeps a word unspoken until that notion is known, and so does any word built from it
export const CONCEPTS = {
//  !!! BASIC LANGUAGE !!!
    water:    { name: "Water",    stage: "basic" },
    earth:    { name: "Earth",    stage: "basic" },
    fire:     { name: "Fire",     stage: "basic" },
    wind:     { name: "Wind",     stage: "basic" },
    cold:     { name: "Cold",     stage: "basic" },
    rot:      { name: "Rot",      stage: "basic" },

    grass:    { name: "Grass",    stage: "basic" },
    stone:    { name: "Stone",    stage: "basic" },

    plant:    { name: "Plant",    stage: "basic", notion: "plant" },
    tree:     { name: "Tree",     stage: "basic" },
    forest:   { name: "Forest",   stage: "basic", of: ["tree", "tree"] },

    pond:     { name: "Pond",     stage: "basic", of: ["earth", "water"] },
    ocean:    { name: "Ocean",    stage: "basic", of: ["water", "water"] },

    reef:     { name: "Reef",     stage: "basic", of: ["stone", "water"] },
    marsh:    { name: "Marsh",    stage: "basic", of: ["rot", "water"] },
    ice:      { name: "Ice",      stage: "basic", of: ["cold", "water"] },
    mushroom: { name: "Mushroom", stage: "basic", of: ["rot", "tree"] },

    smoke:    { name: "Smoke",    stage: "basic", of: ["fire", "wind"] },
    ash:      { name: "Ash",      stage: "basic", of: ["fire", "rot"], notion: "ash" },

//  !!! DAILY LANGUAGE !!!
    sun:      { name: "Sun",      stage: "daily" },
    moon:     { name: "Moon",     stage: "daily" },
    day:      { name: "Day",      stage: "daily" },
    night:    { name: "Night",    stage: "daily" },

    person:   { name: "Person",   stage: "daily" },
    beast:    { name: "Beast",    stage: "daily", notion: "beast" },

    eat:      { name: "Eat",      stage: "daily" },
    go:       { name: "Go",       stage: "daily" },
    give:     { name: "Give",     stage: "daily" },
    take:     { name: "Take",     stage: "daily" },

    rain:     { name: "Rain",     stage: "daily", of: ["water", "wind"], notion: "weather" },

    fish:     { name: "Fish",     stage: "daily", of: ["water", "beast"] },
    bird:     { name: "Bird",     stage: "daily", of: ["wind", "beast"] },
    hunt:     { name: "Hunt",     stage: "daily", of: ["go", "beast"] },
    meat:     { name: "Meat",     stage: "daily", of: ["beast", "eat"] },
    spear:    { name: "Spear",    stage: "daily", of: ["tree", "stone"] },

    drink:    { name: "Drink",    stage: "daily", of: ["take", "water"] },
    salt:     { name: "Salt",     stage: "daily", of: ["ocean", "stone"], notion: "salt" },

    hearth:   { name: "Hearth",   stage: "daily", of: ["stone", "fire"] },
    home:     { name: "Home",     stage: "daily", of: ["person", "hearth"] },

//  !!! ABSTRACT LANGUAGE !!!
    not:      { name: "Not",      stage: "abstract" },
    speak:    { name: "Speak",    stage: "abstract" },
    want:     { name: "Want",     stage: "abstract" },
    far:      { name: "Far",      stage: "abstract" },
    many:     { name: "Many",     stage: "abstract" },

    few:      { name: "Few",      stage: "abstract", of: ["not", "many"] },
    command:  { name: "Command",  stage: "abstract", of: ["want", "speak"] },
    hunger:   { name: "Hunger",   stage: "abstract", of: ["want", "eat"], notion: "hunger" },
    herd:     { name: "Herd",     stage: "abstract", of: ["many", "beast"], notion: "herd" },

    good:     { name: "Good",     stage: "abstract", of: ["many", "give"] },
    bad:      { name: "Bad",      stage: "abstract", of: ["not", "good"] },

    life:     { name: "Life",     stage: "abstract", of: ["day", "person"] },
    death:    { name: "Death",    stage: "abstract", of: ["night", "person"] },

    tomorrow: { name: "Tomorrow", stage: "abstract", of: ["night", "sun"] },
    yesterday:{ name: "Yesterday",stage: "abstract", of: ["sun", "night"] },

    culture:  { name: "Culture",  stage: "abstract", of: ["yesterday", "life"] },

    self:     { name: "Self",     stage: "abstract", of: ["person", "person"] },
    kin:      { name: "Kin",      stage: "abstract", of: ["many", "self"] },
    friend:   { name: "Friend",   stage: "abstract", of: ["good", "person"] },
    name:     { name: "Name",     stage: "abstract", of: ["person", "speak"] },
    ancestor: { name: "Ancestor", stage: "abstract", of: ["yesterday", "person"] },
    child:    { name: "Child",    stage: "abstract", of: ["tomorrow", "person"] },
    leader:   { name: "Leader",   stage: "abstract", of: ["command", "person"] },

//  !!! SPECIALIZED LANGUAGE !!!
    pattern:  { name: "Pattern",  stage: "specialized" },
    god:      { name: "God",      stage: "specialized"},
    make:     { name: "Make",     stage: "specialized" },

    clay:     { name: "Clay",     stage: "specialized", of: ["make", "earth"], notion: "clay" },
    pot:      { name: "Pot",      stage: "specialized", of: ["clay", "make"] },
    cloth:    { name: "Cloth",    stage: "specialized", of: ["plant", "pattern"] },
    crystal:  { name: "Crystal",  stage: "specialized", of: ["pattern", "earth"], notion: "crystal" },

    know:     { name: "Know",     stage: "specialized", of: ["self", "speak"] },
    write:    { name: "Write",    stage: "specialized", of: ["make", "speak"], notion: "mark" },
    count:    { name: "Count",    stage: "specialized", of: ["many", "speak", "pattern"] },

    trade:    { name: "Trade",    stage: "specialized", of: ["give", "take", "want"], notion: "journey" },

    medicine: { name: "Medicine", stage: "specialized", of: ["life", "plant"] },
    seed:     { name: "Seed",     stage: "specialized", of: ["tomorrow", "plant"], notion: "harvest" },

//  !!! LATER ONES (not anything yet) !!!
    // metal
    // rope?
    // tradition
    // season
    //
};

// Scenes with near are only overheard where that land is part of the settlement's territory
const NEAR = {
    pond: ["pond"],
    ocean: ["ocean", "deep-ocean"],
    reef: ["reef", "coral-reef", "great-reef"],
    woods: ["forest", "dense-forest", "ancient-forest"],
    ice: ["ice-field", "glacier", "ice-cap"],
    marsh: ["marsh", "swamp", "mangrove"],
    fungi: ["mushroom-grove", "fungal-forest", "mycelial-network"],
};

// A phrase says a few of the concepts its scene is about; a scene comes up once all of them can be heard
export const SCENES = {
//  !!! BASIC SCENES !!!
    stream:    { text: "Someone scoops a drink from the stream", about: ["water"] },
    dig:       { text: "Someone kneels, digging in the dirt with a sharpened stick", about: ["earth"] },
    stones:    { text: "Someone sorts through rocks on the bare ground", about: ["stone", "earth"] },
    kindling:  { text: "Someone feeds the flames with dry stalks", about: ["fire", "grass"] },
    gust:      { text: "A gust nearly blows the flames out", about: ["wind", "fire"] },
    shiver:    { text: "Someone pulls a hide tight against the biting gusts", about: ["cold", "wind"] },
    meadow:    { text: "The green blades bend flat in the breeze", about: ["grass", "wind"] },
    frost:     { text: "Frost covers the ground at first light", about: ["cold", "earth"] },
    log:       { text: "Someone kicks open a soft, crumbling old log", about: ["rot", "tree"] },
    lone:      { text: "Someone rests in the shade of a lone oak", about: ["tree"] },
    rain:      { text: "Puddles form on the hard ground after a downpour", about: ["water", "earth"] },
    firepit:   { text: "Someone lugs a heavy rock over to the flames", about: ["stone", "fire"] },
    spoiled:   { text: "Someone sniffs a spoiled root and throws it away", about: ["rot"] },
    splash:    { text: "A child splashes at the edge of the still pool", about: ["pond", "water"], near: "pond" },
    frogs:     { text: "Frogs croak from the still pool at dusk", about: ["pond"], near: "pond" },
    shore:     { text: "Two people look out over the endless waves as the breeze picks up", about: ["ocean", "water", "wind"], near: "ocean" },
    spray:     { text: "Spray blows in off the crashing waves", about: ["ocean", "wind"], near: "ocean" },
    coral:     { text: "A diver comes up from the sharp shallows with a cut hand", about: ["reef", "water"], near: "reef" },
    shallows:  { text: "Someone points at the rocks just under the surface, out past the breakers", about: ["reef", "stone", "water"], near: "reef" },
    branches:  { text: "Someone comes back from the deep woods, arms full of branches", about: ["forest", "tree"], near: "woods" },
    edge:      { text: "Children are called back from the edge of the woods", about: ["forest"], near: "woods" },
    mud:       { text: "Someone pulls a foot out of the stinking bog mud", about: ["marsh", "rot", "earth"], near: "marsh" },
    mist:      { text: "Mist hangs low over the bog", about: ["marsh", "water"], near: "marsh" },
    slip:      { text: "Someone slips and falls on the frozen ground", about: ["ice", "cold"], near: "ice" },
    icehole:   { text: "Someone chips through the frozen crust with a rock to get at what's underneath", about: ["ice", "water", "stone"], near: "ice" },
    caps:      { text: "Someone holds up a pale cap they found and asks if it's safe", about: ["mushroom"], near: "fungi" },
    stump:     { text: "Pale caps crowd a crumbling stump", about: ["mushroom", "rot", "tree"], near: "fungi" },
    growing:   { text: "Someone notices a small flower deep in the woods", about: ["forest", "plant"], near: "woods" },
    sprout:    { text: "Someone points at a green shoot pushing up through the dirt", about: ["plant", "earth"] },
    weeds:     { text: "Someone pulls up weeds choking the meadow", about: ["plant", "grass"] },
    smoky:     { text: "Grey fumes from the flames sting everyone's eyes", about: ["smoke", "fire"] },
    drift:     { text: "Someone watches grey plumes drift away on the breeze", about: ["smoke", "wind"] },
    ashes:     { text: "Someone rakes grey, dead cinders out of last night's flames", about: ["ash", "fire", "cold"] },
    burnt:     { text: "Someone digs grey cinders into the dirt", about: ["ash", "earth"] },
    passedpond:{ text: "Someone describes a still pool they passed on the way back", about: ["pond", "water"] },
    tellocean: { text: "A traveler talks about waves stretching as far as anyone can see", about: ["ocean", "water"] },
    tellreef:  { text: "Someone warns about sharp rocks hidden just under the waves", about: ["reef", "stone"] },
    tellmarsh: { text: "Someone complains about the stink of a bog they crossed", about: ["marsh", "rot"] },
    tellice:   { text: "Someone remembers a winter when the water turned hard", about: ["ice", "cold"] },
    tellforest:{ text: "Someone talks about woods so thick the light can't get in", about: ["forest", "tree"] },
    tellcaps:  { text: "Someone brings back a strange pale cap from their travels", about: ["mushroom"] },

//  !!! DAILY SCENES !!!
    dawn:      { text: "The first light spills over the camp", about: ["sun"] },
    gather:    { text: "Everyone comes together around the fire pit after dark", about: ["hearth", "night", "person"] },
    setout:    { text: "A party with flint-tipped poles heads out at first light", about: ["hunt", "go", "sun"] },
    drag:      { text: "Someone drags a deer back to camp after the chase", about: ["beast", "hunt", "person"] },
    share:     { text: "Roasted flesh is passed out around the flames", about: ["eat", "meat", "fire"] },
    stranger:  { text: "Someone points at a stranger watching from the hills", about: ["person", "go"] },
    flock:     { text: "A flock takes off with a clatter of wings into the breeze", about: ["bird", "wind", "go"] },
    shoo:      { text: "Children chase the pecking, flapping thieves away from the food", about: ["bird", "go", "eat"] },
    howl:      { text: "Something howls out in the dark", about: ["night", "beast"] },
    embers:    { text: "Someone banks the embers in the ring of rocks", about: ["hearth", "fire", "stone"] },
    supper:    { text: "They share a meal together as the light fades", about: ["eat", "sun", "night"] },
    family:    { text: "A father, mother, and their child head back to their hut", about: ["home", "go", "kin"] },
    leave:     { text: "A family packs up and leaves", about: ["go", "far", "kin"] },
    tracks:    { text: "Someone kneels over hoofprints in the dirt", about: ["beast", "earth", "hunt"] },
    gut:       { text: "Someone cleans a fresh catch from the river on a flat rock", about: ["fish", "stone", "eat"] },
    jump:      { text: "Silver scales flash as something leaps in the shallows", about: ["fish", "water"] },
    gulls:     { text: "Gulls wheel over the waves", about: ["bird", "ocean"], near: "ocean" },
    berries:   { text: "Someone picks berries from a bush for a snack", about: ["take", "plant", "eat"] },
    moonrise:  { text: "A pale round glow rises over the camp in the dark", about: ["moon", "night"] },
    moonlit:   { text: "Someone finds their way back to their hut by pale silver light", about: ["moon", "home", "go"] },
    longday:   { text: "Someone rests in the warm light after hours of work", about: ["day", "sun"] },
    waking:    { text: "Everyone wakes up and sets off to work in the morning light", about: ["day", "go", "person"] },
    gift:      { text: "Someone hands a string of shells to a neighbor", about: ["give", "person"] },
    feed:      { text: "A mother presses mashed roots into her baby's mouth with her fingers", about: ["give", "eat"] },
    grab:      { text: "Someone grabs the biggest cut of roasted flesh", about: ["take", "meat", "eat"] },
    snatch:    { text: "A gull snatches a silver catch right out of someone's hands", about: ["take", "bird", "fish"] },
    downpour:  { text: "Everyone runs for shelter as the sky opens up", about: ["rain", "go"] },
    leak:      { text: "Drops drip through a gap in the hide roof of the hut", about: ["rain", "home", "water"] },
    homeward:  { text: "Those who chased deer since morning trudge back to their huts", about: ["home", "hunt", "day"] },
    patch:     { text: "Someone packs mud and reeds into a hole in the wall of their hut", about: ["home", "person"] },
    roast:     { text: "Flesh sizzles over the ring of hot rocks", about: ["meat", "hearth", "fire"] },
    thirst:    { text: "Someone gulps from a spring after a long walk", about: ["drink", "water", "go"] },
    skin:      { text: "A hide pouch is passed around, everyone gulping from it and handing it on", about: ["drink", "give", "take"] },
    lashing:   { text: "Someone lashes a sharp flint point to a straight sapling with sinew", about: ["spear", "stone", "tree"] },
    throw:     { text: "Someone flings a long flint-tipped pole at a running deer", about: ["spear", "hunt", "beast"] },
    curing:    { text: "Someone rubs white grains into strips of flesh", about: ["salt", "meat"] },
    crust:     { text: "Someone scrapes white crust off the rocks by the waves", about: ["salt", "ocean", "stone"], near: "ocean" },

//  !!! ABSTRACT SCENES !!!
    whereto:   { text: "A child asks where the ones with flint-tipped poles went off to", about: ["far", "go", "hunt"] },
    plan:      { text: "An elder tells everyone where they must head once the next morning comes", about: ["command", "tomorrow", "go", "person"] },
    refuse:    { text: "Someone refuses to share their food", about: ["not", "eat", "want"] },
    horizon:   { text: "Someone points way past the distant hills", about: ["far", "go"] },
    dead:      { text: "An elder says aloud what each of the long-gone elders was called", about: ["name", "ancestor", "speak"] },
    hush:      { text: "Everyone falls quiet when one voice rises", about: ["speak", "person", "leader"] },
    wait:      { text: "A little one is told to hold off until the next morning", about: ["tomorrow", "want", "not", "child"] },
    meal:      { text: "An elder tells a tale from his youth", about: ["many", "yesterday", "self", "speak"] },
    spirits:   { text: "Someone asks what the long-dead elders would wish for", about: ["ancestor", "want", "speak"] },
    argue:     { text: "Two people argue by the fire pit", about: ["speak", "not", "want", "hearth"] },
    tales:     { text: "Someone tells a story about endless waves in a distant land", about: ["far", "ocean", "speak"] },
    naming:    { text: "A newborn is given what they'll be called", about: ["name", "person", "child"] },
    friend:    { text: "Someone calls out to their closest companion", about: ["name", "friend", "speak"]},
    follow:    { text: "Everyone on the chase follows one voice", about: ["leader", "hunt", "command"] },
    fetch:     { text: "Someone is ordered to fill a skin at the stream, and heads off", about: ["command", "water", "go"] },
    refusal:   { text: "A child shakes their head at the food", about: ["not", "eat"] },
    hungry:    { text: "Someone's stomach growls, only scraps in their hands", about: ["few", "eat", "want"] },
    vast:      { text: "Someone gazes into woods that stretch on and on", about: ["tree", "many", "forest"], near: "woods" },
    scarce:    { text: "Only a handful of berries are left on the bush", about: ["few", "plant", "eat"] },
    praise:    { text: "Someone praises the one who brought down the deer", about: ["good", "hunt", "speak"] },
    fairday:   { text: "The sky is clear and bright, and everyone is cheerful", about: ["good", "sun", "day"] },
    birth:     { text: "Everyone gathers to welcome a newborn into the family", about: ["life", "child", "kin"] },
    thaw:      { text: "Green shoots come back up after the frost", about: ["life", "plant", "cold"] },
    burial:    { text: "The body is laid in the ground under a pile of rocks", about: ["death", "earth", "stone"] },
    mourning:  { text: "Someone weeps for a companion who never came back", about: ["death", "friend", "not"] },
    recall:    { text: "Someone remembers where the deer were the morning before", about: ["yesterday", "beast", "far"] },
    grumble:   { text: "Someone grumbles that it poured all the morning before", about: ["yesterday", "rain"] },
    dance:     { text: "Everyone dances around the flames the way the old ones did", about: ["culture", "ancestor", "fire"] },
    songs:     { text: "An elder teaches the little ones the old songs", about: ["culture", "child", "speak"] },
    reflection:{ text: "Someone stares at their own reflection in a still pool", about: ["self", "water"] },
    boast:     { text: "Someone boasts about how much they caught", about: ["self", "hunt", "many"] },
    visit:     { text: "Relatives from a distant camp come to see everyone", about: ["kin", "far", "go"] },
    company:   { text: "Two companions share a meal by the fire pit", about: ["friend", "eat", "hearth"] },
    spit:      { text: "Someone spits out flesh that has gone off", about: ["bad", "meat", "rot"] },
    omen:      { text: "Everyone says a hoot in the dark means trouble", about: ["bad", "bird", "night"] },
    stampede:  { text: "Hundreds of hooves thunder past the camp", about: ["herd", "beast", "many"] },
    trailing:  { text: "A party trails the great drove across the meadow", about: ["herd", "hunt", "grass"] },
    lean:      { text: "Little ones cry with empty bellies at the end of a long winter", about: ["hunger", "child", "cold"] },
    emptypit:  { text: "Someone looks into the empty food pit, hungry", about: ["hunger", "eat", "not"] },

//  !!! SPECIALIZED SCENES !!!
    stars:     { text: "Someone lies awake in the dark, tracing shapes between the countless lights of the sky and calling each one something",
                 about: ["pattern", "night", "many", "name"] },
    weave:     { text: "Someone weaves reeds over and under into a tight basket, showing the little ones how each strand goes",
                 about: ["pattern", "plant", "make", "child"] },
    sacred:    { text: "Everyone falls silent at the ancient oak deep in the woods, where a great spirit is said to live",
                 about: ["god", "tree", "forest", "speak"] },
    offering:  { text: "Before the chase, someone leaves flesh on a flat rock for the spirit who watches over the deer",
                 about: ["god", "meat", "give", "hunt"] },
    thunder:   { text: "Thunder rolls over the hills, and the elders say a great spirit is angry about something wicked someone did",
                 about: ["god", "rain", "bad", "speak"] },
    knapping:  { text: "Someone sits by the fire pit shaping a new flint blade, striking it with a round rock until sharp flakes break away",
                 about: ["make", "stone", "hearth"] },
    coils:     { text: "Someone kneads sticky riverbank mud with a splash from the stream, rolling it into long coils to build up a vessel",
                 about: ["clay", "pot", "make", "water"] },
    kiln:      { text: "A row of shaped mud vessels is set in the embers to harden, and everyone waits to see which ones will crack",
                 about: ["clay", "pot", "fire", "hearth"] },
    spinning:  { text: "Someone beats reed fibers soft, twists them into thread, and weaves the thread into something to wear",
                 about: ["cloth", "plant", "make", "pattern"] },
    swaddle:   { text: "A baby is wrapped in a soft woven wrap against the chill of the dark hours",
                 about: ["cloth", "child", "cold", "night"] },
    glint:     { text: "Someone digs a clear, sharp-faced gem out of the dirt and holds it up so it catches the light",
                 about: ["crystal", "earth", "sun"] },
    charm:     { text: "An elder hangs a glittering gem over the doorway of a hut to keep evil out",
                 about: ["crystal", "home", "bad", "god"] },
    lesson:    { text: "An old tracker tells the young ones everything they've learned about reading prints in the dirt",
                 about: ["know", "hunt", "earth", "child"] },
    asking:    { text: "Someone asks around for anyone sure of the way to the distant shore",
                 about: ["know", "far", "ocean", "speak"] },
    cavewall:  { text: "Someone paints the chase onto the wall of a cave in red ochre, so whoever comes after will learn what happened",
                 about: ["write", "hunt", "know", "tomorrow"] },
    carving:   { text: "Someone scratches marks into a flat rock so the others will remember what the elders said",
                 about: ["write", "stone", "speak", "culture"] },
    notches:   { text: "Someone cuts a notch into a stick with a flint flake for every sunrise since the pale disc was last full, tallying them over and over",
                 about: ["count", "day", "moon", "tree"] },
    shares:    { text: "Someone tallies the catch one by one, so every hut gets as much as the next",
                 about: ["count", "fish", "home", "many"] },
    strangers: { text: "Strangers from a distant land arrive with white grains, hoping to swap them for hides and flesh",
                 about: ["trade", "salt", "far", "meat"] },
    haggle:    { text: "Two people haggle over a flint blade, neither willing to hand over more than they get",
                 about: ["trade", "give", "take", "make"] },
    poultice:  { text: "Someone crushes leaves into a paste and presses it onto the wound of someone gored in the chase",
                 about: ["medicine", "plant", "hunt", "life"] },
    fever:     { text: "Someone boils bitter roots over the flames for a little one burning with fever",
                 about: ["medicine", "child", "fire"] },
    sowing:    { text: "Someone presses small kernels into the soft ground after a downpour, hoping for green shoots in time",
                 about: ["seed", "earth", "rain", "tomorrow"] },
    stores:    { text: "Someone saves the biggest kernels in a fired mud jar to put in the ground next year",
                 about: ["seed", "pot", "clay"] },
};

const rootsOf = (id) => CONCEPTS[id].of ? CONCEPTS[id].of.flatMap(rootsOf) : [id];
const notionsOf = (id) => [CONCEPTS[id].notion, ...(CONCEPTS[id].of || []).flatMap(notionsOf)].filter(Boolean);
const ROOTS = Object.keys(CONCEPTS).filter(id => !CONCEPTS[id].of).sort();

// Catches the easy mistakes when adding words
{
    const stageOf = (id) => SPEECH_IDS.indexOf(CONCEPTS[id]?.stage);
    const spelled = {};
    for (const id in CONCEPTS) {
        if (stageOf(id) < 0) console.warn(`Language: "${id}" has no stage`);
        for (const part of CONCEPTS[id].of || []) {
            if (!CONCEPTS[part] || stageOf(part) > stageOf(id)) console.warn(`Language: "${id}" is built from "${part}", which isn't heard by then`);
        }
        const key = CONCEPTS[id].of ? rootsOf(id).join() : id;
        if (spelled[key]) console.warn(`Language: "${id}" and "${spelled[key]}" would be the same word`);
        spelled[key] = id;
        if (!Object.values(SCENES).some(s => s.about.includes(id))) console.warn(`Language: no scene ever says "${id}"`);
        if (CONCEPTS[id].notion && !NOTIONS[CONCEPTS[id].notion]) console.warn(`Language: "${id}" needs unknown notion "${CONCEPTS[id].notion}"`);
    }
    for (const id of SPEECH_IDS) {
        for (const c of SPEECH_STAGES[id].words || []) if (stageOf(c) < 0 || stageOf(c) > SPEECH_IDS.indexOf(id)) console.warn(`Language: ${id} needs "${c}", which isn't heard by then`);
    }
    for (const id in SCENES) {
        for (const c of SCENES[id].about) if (!CONCEPTS[c]) console.warn(`Language: scene "${id}" is about unknown "${c}"`);
        if (SCENES[id].near && !NEAR[SCENES[id].near]) console.warn(`Language: scene "${id}" is near unknown "${SCENES[id].near}"`);
        for (const c of SCENES[id].about) {
            if (CONCEPTS[c] && new RegExp(`\\b${CONCEPTS[c].name}`, "i").test(SCENES[id].text)) console.warn(`Language: scene "${id}" gives away "${c}"`);
        }
    }
}


//    !!! WORDS !!!

const CONSONANTS = ["k", "t", "p", "m", "n", "s", "l", "r", "h", "f", "g", "d", "w", "b", "v"];
const VOWELS = ["a", "e", "i", "o", "u"];
const SYLLABLES = CONSONANTS.flatMap(c => VOWELS.map(v => [c, v]));

// Every language but the first keeps about half of its roots, spelled a little differently.
// Shifts only ever add letters no plain syllable has, so two words can't come out the same
// Cause it's like there was a proto-language and then nearby people had variations on it
// kinda like the romance languages, but simpler
const KEPT = 0.5;
const SHIFTS = { k: "c", f: "ph", t: "th", s: "z", g: "gh", w: "wh", d: "dh", h: "kh", l: "ll", r: "rh",
                 a: "ae", e: "ei", i: "y", o: "au", u: "oo" };
const SHIFTED_CONSONANTS = 3;
const SHIFTED_VOWELS = 1;

function placeRoots(seed, ids, used) {
    const placed = {};
    for (const id of ids) {
        let i = Math.floor(seededRandom(seed, hashText(id)) * SYLLABLES.length);
        for (let n = 0; used.has(i) && n < SYLLABLES.length; n++) i = (i + 1) % SYLLABLES.length;
        used.add(i);
        placed[id] = i;
    }
    return placed;
}

// Letters the kept roots actually use go first, so the shifts show
function pickShifts(seed, keptSyllables) {
    const inKept = (letter) => keptSyllables.some(syllable => syllable.includes(letter));
    const pick = (letters, count, salt) => letters
        .map(l => [!inKept(l) + seededRandom(seed, salt + hashText(l)), l]).sort((a, b) => a[0] - b[0])
        .slice(0, count).map(([, l]) => l);
    return Object.fromEntries([
        ...pick(Object.keys(SHIFTS).filter(l => CONSONANTS.includes(l)), SHIFTED_CONSONANTS, 11),
        ...pick(Object.keys(SHIFTS).filter(l => VOWELS.includes(l)), SHIFTED_VOWELS, 13),
    ].map(letter => [letter, SHIFTS[letter]]));
}

function buildWords(protoSeed, lang) {
    const proto = placeRoots(protoSeed, ROOTS, new Set());
    const kept = new Set(ROOTS.filter(id => lang.mother || seededRandom(lang.seed, hashText(id)) < KEPT));
    const fresh = placeRoots(lang.seed, ROOTS.filter(id => !kept.has(id)), new Set(Object.values(proto)));
    const shifts = lang.mother ? {} : pickShifts(lang.seed, [...kept].map(id => SYLLABLES[proto[id]]));
    const syllable = (id) => SYLLABLES[kept.has(id) ? proto[id] : fresh[id]].map(l => shifts[l] || l).join("");
    const words = Object.fromEntries(Object.keys(CONCEPTS).map(id => [id, rootsOf(id).map(syllable).join("")]));
    return { words, meaning: Object.fromEntries(Object.keys(words).map(id => [words[id], id])) };
}

const built = new Map();
function wordsOf(lang) {
    const key = `${languageState().seed}:${lang.seed}:${lang.mother}`;
    if (!built.has(key)) built.set(key, buildWords(languageState().seed, lang));
    return built.get(key);
}
export const wordFor = (lang, id) => wordsOf(lang).words[id];
export const conceptOf = (lang, word) => wordsOf(lang).meaning[word] || null;

export const knows = (lang, id) => lang.learned.includes(id);

// What a word looks like it means so far, part by part
export function gloss(lang, id) {
    if (knows(lang, id)) return CONCEPTS[id].name;
    return CONCEPTS[id].of ? CONCEPTS[id].of.map(part => gloss(lang, part)).join("·") : "?";
}


//    !!! PROGRESS !!!

export const speechProgress = (lang, id) => Math.min(SPEECH_STAGES[id].need,
    lang.learned.filter(c => CONCEPTS[c]?.stage === id).length);
export const speechMissing = (lang, id) => (SPEECH_STAGES[id]?.words || []).filter(c => !knows(lang, c));

const speechOpen = (lang, id) => {
    const i = SPEECH_IDS.indexOf(id);
    return i === 0 || (i > 0 && speechReached(lang, SPEECH_IDS[i - 1]));
};
export const speechReached = (lang, id) => speechOpen(lang, id)
    && speechProgress(lang, id) >= SPEECH_STAGES[id].need && !speechMissing(lang, id).length;
export const currentSpeech = (lang) => SPEECH_IDS.find(id => !speechReached(lang, id));

const hearable = (lang) => Object.keys(CONCEPTS).filter(id => speechOpen(lang, CONCEPTS[id].stage) && notionsOf(id).every(notionKnown));
export const candidates = (lang) => hearable(lang).filter(id => !knows(lang, id));
export const unsolved = (lang) => Object.keys(lang.heard).filter(id => CONCEPTS[id] && !knows(lang, id));

export const languageOf = (t) => {
    const lang = languageState().languages[t.id];
    return lang?.center === t.center ? lang : null;
};

// For other content: whether this settlement's speech has come far enough for something
export function speaks(t, unlock) {
    const lang = languageOf(t);
    return !!lang && SPEECH_IDS.some(id => SPEECH_STAGES[id].unlocks?.includes(unlock) && speechReached(lang, id));
}

addEffectSource((t) => {
    const lang = languageOf(t);
    return lang ? SPEECH_IDS.filter(id => speechReached(lang, id)).map(id => SPEECH_STAGES[id]) : [];
});


//    !!! LISTENING !!!

// Seconds per phrase and per guess regained, sped up by how many people there are to listen to
const PHRASE_EVERY = 180;
const GUESS_EVERY = 240;
const PEOPLE_PACE = 50;
export const MOST_GUESSES = 3;
const LOG_LENGTH = 8;
const SCENES_REMEMBERED = 4;
const FIRST_PHRASES = 3;
const FAMILIAR = 0.15;

const pace = (t) => 1 + t.pops / PEOPLE_PACE;
export const nextGuessIn = (t, lang) => (1 - lang.guesses % 1) * GUESS_EVERY / pace(t);
export const nextPhraseIn = (t, lang) => (1 - lang.listened) * PHRASE_EVERY / pace(t);

function startLanguage(t) {
    const ls = languageState();
    const mother = !ls.seed;
    if (mother) ls.seed = 1 + Math.floor(Math.random() * 1e6);
    const lang = { center: t.center, seed: 1 + Math.floor(Math.random() * 1e6), mother,
                   learned: [], wrong: {}, heard: {}, log: [], guesses: MOST_GUESSES, listened: 0 };
    for (let i = 0; i < FIRST_PHRASES; i++) overhear(t, lang);
    return lang;
}

// Back to the first phrases, keeping the same words
export function restartLanguage(t) {
    const lang = languageOf(t);
    Object.assign(lang, startLanguage(t), { seed: lang.seed, mother: lang.mother });
}

const shuffled = (list) => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

// Scenes with nothing new still come up now and then, until every word of their stages is known
function pickScene(t, lang) {
    const open = new Set(hearable(lang));
    const kinds = new Set(Object.values(t.kinds));
    const untold = new Set([...open].filter(c => !knows(lang, c)).map(c => CONCEPTS[c].stage));
    const ids = Object.keys(SCENES).filter(id => SCENES[id].about.every(c => open.has(c))
        && SCENES[id].about.some(c => untold.has(CONCEPTS[c].stage))
        && (!SCENES[id].near || NEAR[SCENES[id].near].some(kind => kinds.has(kind))));
    const weight = (id) => SCENES[id].about.filter(c => !knows(lang, c)).length || FAMILIAR;
    let roll = Math.random() * ids.reduce((total, id) => total + weight(id), 0);
    return ids.find(id => (roll -= weight(id)) <= 0) || ids.at(-1);
}

// Always something new in it, while the scene has anything new to say
function overhear(t, lang) {
    const scene = pickScene(t, lang);
    if (!scene) return;
    const about = shuffled(SCENES[scene].about).sort((a, b) => knows(lang, a) - knows(lang, b));
    const words = shuffled(about.slice(0, 1 + Math.floor(Math.random() * Math.min(3, about.length))));
    lang.log = [...lang.log, { scene, words }].slice(-LOG_LENGTH);
    for (const id of words) lang.heard[id] = [scene, ...(lang.heard[id] || []).filter(s => s !== scene)].slice(0, SCENES_REMEMBERED);
}

export function tickLanguages(dt) {
    const ls = languageState();
    const list = settlements();
    for (const id in ls.languages) {
        if (!list.some(t => String(t.id) === id && t.center === ls.languages[id].center)) delete ls.languages[id];
    }
    for (const t of list) {
        const lang = ls.languages[t.id] ||= startLanguage(t);
        lang.guesses = Math.min(MOST_GUESSES, lang.guesses + pace(t) * dt / GUESS_EVERY);
        lang.listened += pace(t) * dt / PHRASE_EVERY;
        for (let n = 0; lang.listened >= 1 && n < LOG_LENGTH; n++) {
            lang.listened -= 1;
            overhear(t, lang);
        }
        lang.listened %= 1;
    }
}


//    !!! GUESSING !!!

export const guessedWrong = (lang, id, guess) => !!lang.wrong[id]?.includes(guess);
export const canGuess = (lang) => lang.guesses >= 1;

// A guess needs one in hand, but only a wrong one uses it up. Returns whether it was right
export function guess(lang, id, guessed) {
    if (!lang.heard[id] || knows(lang, id) || !canGuess(lang) || guessedWrong(lang, id, guessed)) return null;
    if (guessed === id) {
        lang.learned.push(id);
        delete lang.wrong[id];
        lang.guesses -= 1;
        return true;
    }
    lang.guesses -= 1;
    (lang.wrong[id] ||= []).push(guessed);
    return false;
}
