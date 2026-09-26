# Foreword
An incremental game based around the constant intrusive phrase I have based on
the meme that's in the main folder.  

Without the following code, I wouldn't have been able to make this game for one reason or another:  
The Modding Tree by Acamaeda  
Celestial Incremental by Icecreamdudes  
DodecaDragons by Demonin 
break_eternity.js by Patashu  
  
I've coded in many languages before, but not javascript. Having references 
was instrumental in making this. They gave me a great starting point, both 
conceptually and as a jumping board for where to start.  

The Modding Tree was a great starting point, but I couldn't get the flexibility that
I wanted. I wanted a bit more readability since I forget what I'm doing frequently, so
I ended up not using a whole ton from it. Going through it taught me a lot of fundamentals.

Celestial incremental is probably my most played incremental game, and was a good
inspiration for more unique elements and layers beyond the base of Modding Tree.  

The DodecaDragons UI was used as a heavy inspiration for the draggable canvas layers, 
but coded differently to use CSS instead of manually doing a ton of math and hardcoding stuff.

break_eternity was really useful to deal with really big numbers. It's a massive pain to be dealing
with numbers like 1e250 since normally they're stored with full precision, but break_eternity just
does that for you. Great tool to have, this would have been really annoying without it.

Big thanks to all of them! Check out their stuff! (granted, modding tree is more of
a framework for making a game than an actual game but ignore that and support them pls).

## Running it

Some module stuff is blocked by the browser on "file://" URLs, so you need a tiny local
server. From this folder, either run:  

python3 -m http.server 8000

in the console then open "http://localhost:8000", or use something like some of VSCode's
extensions. I use "HTML Preview", "HTML CSSSupport", and "HTML Boilerplate" as the main extensions.
I also use "Javascript (ES6) code snippets" but that's mostly for the coding side instead of viewing.  

## Architecture and Organization
    index.html                       Skeleton containers only, makes completely new things easier to add. Also imports all the stylesheets  
    scripts/main.js                  Wires everything together  
    
    css/                             Folders group by subject. index.html loads them in cascade order, which is not the same order  
    
        base/                            On screen whatever layer you are on  
            base.css                     Theme variables, reset, body, and the root font size the whole interface scales off. Also themed scrollbars  
            navigation.css               Category bar, sidebar layer tabs, the docked button footer, sub-layer flyout  
            overlays.css                 Sidebar footer buttons, recenter/zoom controls, settings and guide windows  
            mobile.css                   Narrow-screen overrides, loaded last  
    
        canvas/                          What render/ draws for every layer, whichever one it is  
            layer.css                    What a layer draws into, its panel, the header strip, resource chips  
            upgrades.css                 Static canvases upgrade grids, drawers, scene wrapper  
            drag-canvas.css              Pannable viewport, dot grid, sub-windows  
            canvas-hud.css               Fixed controls over a drag canvas, and its drawer  
            nodes.css                    Draggable canvas nodes, their states and tooltips  
            node-effects.css             Node auras, and green + blue nodes' split faces  
    
        world/                           The World map, the one every layer is unlocked from  
            world.css                    The World's backdrop and the hexagons the map is built from  
            terrain.css                  What each kind of ground looks like on a tile  
            transform.css                Turning tiles into other tiles, and the recipe panel  
            interactions.css             Tools inside the HUD: gather, grow, transform, and the cloud button  
    
        pages/                           One layer or sub-layer each  
            environment.css              The ground's reference page  
            grass.css                    Growth, its milestones, and the grasses  
            precipitation.css            The cloud, the bar its charge is held on, and its meters  
            adaptation.css               The first prestige layer  
            banners.css                  The cards page and banner stuff  
            cards.css                    A card itself (art, rarity, deal) and the collection  
            pond.css                     The water, algae/fish, balance and burst timers  
            ocean.css                    The ocean map's regions, currents, schools, and side window  
            forest.css                   The grove, its trees, and the tree window  
            marsh.css                    The marsh basin, its zones and their tooltips  
            ice.css                      The snowpack, its strata and its pressure gauge  
            reef.css                     The reef sites, their meters and growth timers  
            mushroom.css                 The mushroom grove clearing, its beds and basket  
            ecology.css                  Challenges, the running challenge and its goals, and the "start challenge" warning  
            evolution.css                The evolution tree, its nodes, and the meters under it  
            evolution-scenery.css        What sits behind each pressure's tree  
            settlement.css               Settlement pages, their tabs, jobs, projects, and siting one on the map  
            language.css                 Each settlement's speech: overheard phrases, words, and guessing at them  
        
    scripts/  
        core/  
            state.js                 Save data (loading, saving, local storage), lazy per-layer initialization
            registry.js              Registering resources, layers, and sublayers  
            resources.js             Base functions and formatting for resources  
            boosts.js                Global multiplier application and addition  
            nodes.js                 Draggable canvas rules: what are the nodes' parents, requirements, what's visible, what's buyable  
            guides.js                Explanation popups for layers/sublayers, and the glossary term registry  
            loop.js                  The primary game loop: simulation ticks and render ticks    
        
        render/  
            canvasRouter.js          Canvas base, tracks what needs to be redrawn  
            staticCanvas.js          Static canvas renderer: the scene, its upgrade grid and drawers
            upgradePanel.js          The upgrade button grid and the drawer that slides it up, shared by both canvases
            modal.js                 Builds the panels (settings, dev, warnings) and their buttons  
            dragCanvas.js            Pannable canvas, its nodes, and the hook a layer draws moving content with  
            sidebar.js               Category bar, layer tabs, and sub-layer flyout  
            settings.js              Settings window, with themes, save, load, delete, save files  
            guide.js                 Guide window for layers/sublayers and the information button that re-opens it  
            richText.js              Write-guarded markup setter, and resource names colorizing wherever text mentions them  
            fit.js                   Shrinks text to fit its box, and nudges hover tips back on screen  
            tabGuard.js              Web Locks guard so two tabs of the game don't save over each other and second one goes read-only  
            dev.js                   Dev-only cheat window, gives functions for easier testing. There's a toggle in here to disable it  
        
        content/                     One folder per category, global resource definitions, and glossary of game terms and resources
            resourceDefs.js          For defining and registering resources, plus which layer they belong to
            glossary.js              The terms the guide windows and tooltips can explain
            main/
                index.js             	    Imports the category, then every layer in it
                category.js             	    For registering categories
                guides.js                   	The actual text for the guides

                layers/                    	One file per layer
                    coresLayer.js               Starting green + blue draggable canvas layer
                    worldLayer.js               The game's world, a hex map 
                    environmentLayer.js         The ground itself, and the layer grass/precipitation move into
                    aquaticLayer.js             Holds pond and ocean, owns the ocean's save data
                    woodlandLayer.js            Holds the forest, owns the trees' save data
                    ecologyLayer.js             Ecology: running challenge, the card list, and the confirmation before starting
                    adaptationLayer.js          The first prestige, reset some things for adaptation points
                    evolutionLayer.js           The evolution page, its meters and unlockable traits
                    wetlandsLayer.js            Holds the marsh, owns its save data
                    iceLayer.js                 Holds the ice field and the glacier (not built yet), owns the ice field's save data
                    reefLayer.js                Holds the reef and the coral reef, owns the reef's save data
                    fungiLayer.js               Holds the mushroom grove and the fungal forest (not built yet), owns the grove's save data

                sublayers/                 	 A view a layer spreads into its subLayers, exported as a *_VIEW
                    ecosystemSublayer.js        Draggable canvas with the biomes, tiers opened one at a time
                    terrainSublayer.js          The world's tiles, what they turn into, and what each result is worth
                    grassSublayer.js            What the grass is doing, and its upgrades
                    precipitationSublayer.js    The cloud: charging vs. stability, starts as layer and absorbed into environment later
                    pondSublayer.js             The pond, with upgrades/algae/fish as drawers over it. Starts as a layer, absorbed into aquatic
                    oceanSublayer.js            The ocean, its regions, the currents between them, the schools, ocean ticks, and the side window
                    forestSublayer.js           The forest, its trees, their growth choices, and the old growth behind it
                    reefSublayer.js             The seabed, its sites and their windows, the compendium, and the fish swimming through
                    marshSublayer.js            The marsh, its zones, the plants, and their upgrades
                    iceFieldSublayer.js         The ice field, the stratum, drawer upgrades, and the pressure readout
                    mushroomGroveSublayer.js    The mushroom grove, mushroom types, and growth sites

                systems/                    The rules and data that layers read
                    worldMap.js                 The map's shape and what grows on it, shared by the world and the environment
                    biomass.js                  What biomass is worth everywhere, and the global boost it registers
                    challenges.js               All the ecology challenges, what they reset, what they limit/block, their goals, and what finishing them unlocks
                    cards.js                    Adaptation cards, their effects, what's equipped, card combos, banners
                    forestTrees.js              All the trees, how they grow, and what old growth is worth
                    pressures.js                The environmental pressures, and how much of each the world is pushing with
                    evolutionTree.js            Evolution numbers: potential, converting adaptation points, and buying traits
                    evolutionTraits.js          Every evolution trait, one tree per pressure
                    marsh.js                    Zones cycling dry/saturated/flooded/receding, and the plants that follow the wetness
                    iceField.js                 Snow pressed from fresh to ice, the pressure gauge, and the pack collapsing when it fills
                    mushroomGrove.js            The mushroom species, the beds, and the spores/fruit they give back for biomass
                    reef.js                     Where the sites are, habitat pieces and characteristics, what each fish needs, events, and the boosts they give

                art/                        Art only, drawn instead of stored as files
                    terrainArt.js               Tile art, shared by the map and the recipes
                    oceanArt.js                 Region outlines, each fish, boost icons
                    forestArt.js                Drawings for each tree and its stages
                    reefArt.js                  Each rock size, every characteristic laid over it, kelp, and the compendium's book
                    cardArt.js                  Each card's picture, and each banner's badge (built from shared pieces)
                    mushroomArt.js              One drawing per mushroom, all on the same ground line
                    pressureArt.js              Each pressure's meter surface and the scenery behind its evolution tree

            humanity/
                index.js                    Imports the category, then every layer in it
                category.js                 Registers the Humanity category
                guides.js                   The text for Humanity's guides

                layers/
                    settlementLayer.js          Each settlement's page, the tabs between them, and the button to find a site
                    settlementSiting.js         Settlements on the world map, candidate sites, borders, and the founding confirmation
                    languageLayer.js            Listening in on each settlement's speech and guessing what its words mean

                systems/
                    settlements.js              Where a settlement can go, what kind it becomes, its people, jobs, projects, and dying out
                    settlementNames.js          Generated names, built from halves that match the settlement's types
                    language.js                 Speech stages, concepts and scenes, seeded words for each settlement, and guessing

                art/
                    settlementArt.js            Map sprites and village scenes by size (tents, huts, houses)
        
        utils/  						General utility functions, used throughout many places
            break_eternity.min.js         Big number library for Decimals, written by Patashu under MIT license  
            decimal.js                    Re-exports Decimal as a module, plus the D() shorthand  
            format.js                     Number formatting, works with Decimal  
            dom.js                        Write-guards for text/display/width/CSS vars, so unchanged values don't redo style work  
            hex.js                        Hex-grid math (neighbors, pixel positions), shared by the map and ecosystem tree  
            math.js                       Small shared number helpers: clamp, and a seeded random for repeatable art

## Terminology for coding things

This will list what the term corresponds to and a bit of information on it

Category:           Rendered by the top bar, it's a group of layers  
Group:              Groupings of tabs in the sidebar  
Layer:              A tab in the sidebar  
Sub-layer:          A tab in the sidebar flyout, has a parent layer  

Canvas:             The main window of a layer, either a draggable canvas or static canvas  
Draggable Canvas:   Canvases that you can move around, movable elements  
Static Canvas:      Canvases that stay the same, with defined constant element positions  

Sub-window:         A window inside a layer or sub-layer
Node:               Clickable circles on draggable canvases, they have parents  
Tile:               Clickable tiles, they can check adjacency and such  
Scene:              A layer's drawing. On a static canvas it's still, drag canvas it pans and zooms  

Global boost:       A multiplier on a resource wherever it's made  

Drawer:             Openable tab on a static canvas  
Guide:              Tutorial information given on opening a layer for the first time OR hitting the info button  

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