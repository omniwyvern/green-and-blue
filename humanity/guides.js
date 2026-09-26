// guides.js
//
// Popups for Humanity's layers

import { registerGuide } from "../../core/guides.js";
import { settlements } from "./systems/settlements.js";
import { expeditionsOpen } from "./systems/expeditions.js";

registerGuide("settlement-intro", {
    layer: "settlement",
    title: "Settlement",
    when: () => settlements().length === 0,
    body: `
        <p>Someone is ready to stay put. Find them a place on the world map.</p>
        <p>Sites are judged on what's around them: food, fresh water, wood, and how hard the land is to
        live on. Too much of something counts against a site as well. The kind of land around a settlement decides what sort of place it becomes.</p>
        <p>Founding is permanent. The settlement's seven tiles can never be changed again.</p>
    `,
});

registerGuide("settlement-running", {
    layer: "settlement",
    title: "Running a Settlement",
    order: 1,
    when: () => settlements().length > 0,
    body: `
        <p>Each point of population stands for many people. Anyone without a job gathers; move them to
        hunting or carrying water with + and -. The land only has room for so many gatherers and so many
        hunters, and past that each extra one finds a quarter as much. Some kinds of land swap a job for
        something better: fishing places spear fish instead of hunting, fens cut reeds instead of
        gathering.</p>
        <p>Spare food is what makes it grow, slowly, up to its shelter. Water keeps it running: short
        on water, work suffers and growth nearly stops. If the food store empties, people die, and a
        settlement with no one left is gone for good.</p>
        <p>Projects are worked by people taken off their jobs: the more on one, the faster it goes, and
        progress stays when they leave. Building shelter is always on offer, next to two improvements to
        the settlement and one discovery its own land has to teach. Once it's big enough to spare a few
        people, it can scout the land around it, which opens up expeditions.</p>
    `,
});

registerGuide("settlement-expeditions", {
    layer: "settlement",
    title: "Expeditions",
    order: 2,
    anywhere: true,
    when: () => settlements().some(expeditionsOpen),
    body: `
        <p>The land around the settlement has been scouted, and the world has opened out by a ring. People can
        now be sent out on expeditions from the Settlement tab.</p>
        <p>Pick a route out from the settlement, one tile at a time, and choose how many go. The longer
        the route and the bigger the group, the more food, water and materials it takes, and the longer
        they are gone. They turn back the way they came at the end of the route, unless it ends on the
        settlement's own land, in which case they come home that way instead.</p>
        <p>Every tile they cross gives them something to carry home, up to what they can hold, and
        teaches them about the discoveries that belong to that land. That's the way to learn what your
        settlement's own land never offers. Nobody crosses the open ocean or a reef on foot; that takes a boat.</p>
        <p>Along the way they'll come across things worth stopping for. Stopping costs time, never what
        they're carrying. If nobody decides, they carry on.</p>
    `,
});

registerGuide("knowledge-lore", {
    layer: "knowledge",
    subLayer: "lore",
    title: "Knowledge",
    body: `
        <p>Something has been learned that's worth keeping track of. Lore lists every discovery any
        settlement has made, and which settlements know it.</p>
        <p>Discoveries belong to the settlement that made them. Once enough have been made, people
        start working things out together, and the innovations they reach are listed here too.</p>
    `,
});

registerGuide("knowledge-innovation", {
    layer: "knowledge",
    subLayer: "innovation",
    title: "Innovation",
    body: `
        <p>Expeditions now bring home notions: Earth, Water, Wind, Fire, Pattern and Rot from any land,
        and rarer ones from older, richer land. Some notions are never found at all and can only be
        made. Each person can keep only so many in mind, so bigger
        expeditions bring back more. The planner shows what a route will bring before it leaves.</p>
        <p>Two notions can be combined into a new one. Click a slot to choose it, then a
        notion to put there; clicking the chosen slot again, or a notion already in a slot, empties it. Each try uses up one of each, even when
        the pair makes nothing, so guess carefully. A pair that made nothing is crossed out from then on,
        and anything you make or find is written into the manual with its recipe: hover one to see where
        it's found, or click it to make one. The line under the
        slots says how many new notions what you know could still make.</p>
        <p>Every innovation grows out of discoveries, and it only shows up in the list once the
        discoveries behind it have been made somewhere. Some also need other innovations first.</p>
        <p>An innovation is worked out on a note: its notions are pinned around the edge, and every one
        has to be joined into a single chain. Two neighbors link when one is made from the other, so
        Clay links to Earth and to Water. Choose a notion, then click a space to place it; click it
        again to take it back off. Each notion placed is spent, and so is one taken back off.
        A note can be started before all its notions are found, but nothing links to a notion you
        haven't found; hovering its ? gives a clue to what makes it.</p>
        <p>Innovations belong to everyone: each one helps every settlement, including ones founded
        later, and is listed under Lore.</p>
    `,
});

registerGuide("language", {
    layer: "language",
    title: "Language",
    body: `
        <p>Every settlement speaks its own way. People talk while they work, and every so often
        you overhear a few words along with what was going on at the time. Bigger settlements have more
        to overhear.</p>
        <p>Click a word to work on it, then pick what you think it means. What was going on when it was
        said is the best clue. A guess is used up whether it's right or wrong, and guesses only come
        back slowly. A wrong answer is crossed out for that word.</p>
        <p>Simple things have short words, and bigger ideas are built from them: once you know the words
        for Water and Stone, a word made of both of them is easy to spot. Settlements that learned to speak
        from each other share some words, spelled a little differently.</p>
        <p>Knowing enough words moves a settlement's speech on to the next stage. More people can
        live together once they can talk to each other, and some ideas can't be put into words at all without the right ones.</p>
    `,
});
