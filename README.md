# Foreword
An incremental game based around the constant intrusive phrase I have based on
the meme that's in the main folder.  

Without the following code, I wouldn't have been able to make this game for one reason or another:  
The Modding Tree by Acamaeda  
DodecaDragons by Demonin  
Celestial Incremental by Icecreamdudes  
break_infinity.js by Patashu  
  
I've coded in many languages before, but not javascript. Having references 
was instrumental in making this. They gave me a great starting point, both 
conceptually and as a jumping board for where to start.  

The Modding Tree was a good framework, but I couldn't get the flexibility that
I wanted. Also not quite as readable as I wanted, primarily lots of stuff using
number id's instead of named ones, making it hard to read without referencing other files.  

I really liked the DodecaDragons UI, but (as per their code comments) it was pretty
laggy and not all optimized/structured. I was able to get a similar kind of thing
using CSS translating, so it runs better and is more scalable instead of hard-coding things.  

Celestial incremental is probably my most played incremental game, and was a good
inspiration for more unique elements and layers beyond the base of Modding Tree.  

Big thanks to all of them! Check out their stuff! (granted, modding tree is more of
a framework for making a game than an actual game but ignore that and support them pls).
They're why I also have a blank example of this framework for people who want to use it.  

## Running it

Some stuff is blocked by the browser on "file://" URLs, so you need a tiny local
server. From this folder, either run:  

python3 -m http.server 8000

in the console then open "http://localhost:8000", or use something like some of VSCode's
extensions. I use "HTML Preview, HTML CSSSupport, and HTML Boilerplate" as the main extensions.
I also use "Javascript (ES6) code snippets" but that's mostly for the coding side I think.  

## Architecture and Organization
    index.html                       skeleton containers only, makes completely new things easier to add. Also imports all the stylesheets  
    main.js                          wires everything together  
    
    css/                             one file per subject. Tons of files, but makes it easier to find specific styling  
        base.css                     theme variables, reset, body, and the root font size the whole interface scales off  
        navigation.css               category bar, sidebar layer tabs, sub-layer flyout  
        layer.css                    what a layer draws into, has its panel, the header strip, resource chips  
        upgrades.css                 the static canvas, has upgrade grid, drawers, scene wrapper  
        world.css                    the World's backdrop and the hexagons the map is built from  
        terrain.css                  what each kind of ground looks like on a tile  
        transform.css                turning tiles into other tiles, and the recipe panel  
        canvas-hud.css               the fixed controls over a drag canvas, and its drawer  
        interactions.css             the tools inside the HUD: gather, grow, transform, and the cloud button  
        precipitation.css            the cloud, the bar its charge is held on, and its meters  
        environment.css              the ground's reference page  
        evolution.css                the (probably first) prestige layer  
        banners.css                  the cards page and its banner stage  
        cards.css                    a card itself (art, rarity, deal) and the collection  
        pond.css                     the water, algae/fish, balance and burst timers  
        drag-canvas.css              pannable viewport, dot grid, sub-windows  
        nodes.css                    draggable canvas nodes, their states and tooltips  
        node-effects.css             auras, and green + blue nodes' split faces  
        ocean.css                    the ocean map: regions, currents, schools, and its side window  
        overlays.css                 corner buttons, settings and guide windows  
        
    scripts/  
        core/  
            state.js                     save data (loading, saving, local storage), lazy per-layer init  
            registry.js                  the stuff to register resources, layers and sublayers  
            resources.js                 base functions and formatting for resources. Can you afford it, spend if, the amount, etc.  
            boosts.js                    global multiplier application and addition, owners use registerBoost(), producers use boostResource(id)  
            nodes.js                     draggable canvas rules: what are the nodes' parents, requirements, what's visible, what's buyable  
            guides.js                    allows registering guides, the explanation popup for layers/sublayers  
            loop.js                      primary game loop. simulation tick (always) + render tick (only visible and if dirty)    
        
        render/  
            canvasRouter.js              static/drag canvas base (or a layer's active sub-layer), tracks what needs to be redrawn  
            staticCanvas.js              static canvas + upgrade-grid renderer (string-keyed instead of number id's for readability)  
            dragCanvas.js                reusable pannable canvas class + draggable canvas nodes, plus the hook a layer draws moving content with  
            sidebar.js                   category bar, layer tabs, and sub-layer flyout  
            settings.js                  the settings window. Themes, save, load, delete, save files  
            guide.js                     the guide window for layers/sublayers + the information button that re-opens it  
            richText.js                  write-guarded markup setter + resource names colorized wherever prose mentions them  
            dev.js                       dev-only cheat window, gives functions for easier testing. There's a toggle in here to disable it  
        
        content/                        one folder per category, one file per layer (and sometimes sublayer because restructuring earlier)  
            resourceDefs.js             registerResources() - every resource in the game, whatever category shows it:  
                                        its name, color, and which layer holds the pool. main.js imports it first  
            main/  
                index.js                    imports the category, then every layer in it  
                category.js                 registerCategory()  
                biomass.js                  what biomass is worth everywhere, and the global boost it registers  
                coresLayer.js               green + blue draggable canvas layer  
                worldMap.js                 the map's shape and what grows on it, shared by the two below  
                worldLayer.js               the world that's growing, a hex map once Land is bought  
                grassSublayer.js            what the grass is doing, and its upgrades  
                precipitationSublayer.js    the cloud: charging vs. stability, starts as layer and absorbed into environment later  
                pondSublayer.js             the pond, with upgrades/algae/fish as drawers over it. starts as layer, abosrbed into environment   
                aquaticLayer.js             holds pond and ocean, and owns the ocean's save data  
                oceanSublayer.js            the ocean: regions, the currents between them, the schools, ocean ticks, and the side window  
                oceanArt.js                 the drawing for the ocean - region outlines, each fish, boost icons  
                environmentLayer.js         the ground itself, and the layer the three above move into  
                terrainArt.js               the drawing for each kind of ground, shared by the map and the recipes  
                evolutionLayer.js           the (first?) prestige. Reset what grew for evo points, keep (most?) non-biological upgrades  
                cards.js                    evolution cards. Evo points spent for them. What they do, what's equipped, card combos, banners  
                cardArt.js                  the picture on each card, and each banner's badge (built from shared pieces)  
                guides.js                   the text of every explanation popup (imported last)  
                (and some unimplemented files as well)  
        
        utils/  
            break_eternity.min.js         big-number library (UMD, sets globalThis.Decimal), written by Patashu under MIT license  
            decimal.js                    re-exports Decimal as a module, plus the D() shorthand  
            format.js                     number formatting, works with Decimal  
            dom.js                        write-guards for text/display/width/CSS vars, so unchanged values don't redo style work  
            hex.js                        hex-grid math (neighbours, pixel positions), shared by the map and ecosystem tree  
            tabGuard.js                   Web Locks guard so two tabs of the game don't save over each other; second one goes read-only   


## Terminology for coding things

This will list what the term corresponds to and a bit of information on it

Category:           rendered by the top bar, it's a group of layers  
Group:              groupings of tabs in the sidebar  
Layer:              a tab in the sidebar  
Sub-layer:          a tab in the sidebar flyout, has a parent layer  

Canvas:             the main window of a layer, either a draggable canvas or static canvas  
Draggable Canvas:   canvases that you can move around, movable elements  
Static Canvas:      canvases that stay the same, with defined constant element positions  

Sub-window:         a window inside a layer or sub-layer  
Node:               clickable circles on draggable canvases, they have parents  
Tile:               clickable tiles, they can check adjacency and such  
Scene:              a layer's drawing. On a static canvas it's still, drag canvas it pans and zooms  

Global boost:       a multiplier on a resource wherever it's made  
Resource:           defined once in content/resourceDefs.js, shared across categories. A layer's `resources` is only the list of
                    which ones its header shows, either ["id", ...] or { id: { hidden, note } }  
Holder:             the one layer whose save slot keeps a resource's pool. Every layer showing it
                    reads and spends that same pool, so there is never a second copy  

Drawer:             openable tab on a static canvas  
Guide:              tutorial information given on opening a layer for the first time OR hitting the info button  

## Contacting me

Email me at omniwyvern@gmail.com for anything like:

    - bugs
    - errors/issues
    - comments
    - concerns
    - suggestions
    - help

Or pretty much anything else. Please don't be mean with my email and sign me up for stuff.  

If possible when sending a bug/error report or have a security concern, please give me:

    Description of the error/bug/vulnerability
    Affected component (version, commit, branch etc.)
    Affected code (file path, line numbers), visible through F12 or right click inspect, then the error in console  

If that's too much, just a description of what happened on what layer would be great.

## Known issues (bugs or unimplemented things)
    - Deep ocean tiles don't do anything right now, although they do count as oceans for the ocean layer.
    - Nothing calls drawInSchool() yet, so only cod are available.
    - No visual indicator for the Tidal Cycle card.
    - The pond's capacity comes from the pondDeep node, cards, and pond tiles on the world map.
      There's still no upgrade for it. Needs balancing.
    - A tooltip on a node near the canvas edge is clipped by the viewport.
    - No offline progress calculation on load.
    - Achievements/milestones/challenges from the Modding-Tree structure aren't
      added yet. Reasonable to add as their own render/ file plus a field on layer
      definitions, following the same pattern as upgrades.