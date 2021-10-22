"use strict";
import * as HelperFunctions from "./helper-functions.js";
let socket;

// also register socket to share clock data
Hooks.once("socketlib.ready", () => {
    socket = socketlib.registerModule("hud-and-trackers");
    socket.register("renderNewClockFromData", renderNewClockFromData);
    socket.register("saveAndRenderApp", saveAndRenderApp);
    socket.register("saveClock", saveClock);
});
//attack all the clocks to their linked entities' render hooks
// start a rendered clock object to keep track of
// all the rendered clocks
Hooks.on("ready", () => {
    game.renderedClocks = {};
    hookEntities();
});
Hooks.on("renderClockViewer", (app, html) => {
    game.clockViewer = app;
});
Handlebars.registerHelper("isNumber", function (value) {
    return Number.isNaN(value);
});
Handlebars.registerHelper("getValue", function (array, index) {
    return array[index];
});

Handlebars.registerHelper("times", function (n, block) {
    var accum = "";
    for (var i = 0; i < n; ++i) accum += block.fn(i);
    return accum;
});

class Clock extends FormApplication {
    constructor(clockData) {
        super({
            data: clockData,
        });
        this.data = clockData;
        console.log("Rendering new clock");
    }

    //this will be used for when the clock data update is coming from a different
    //location
    updateEntireClock(clockData, dontSave) {
        this.data = clockData;
        if (dontSave) {
            console.log("should be rendering");
            this.render(true);
        } else {
            this.saveAndRenderApp();
        }
    }
    /**
     *
     * @param {section} sectionId the id of the section we're targeting
     * @param {data} data - the data we're sending through
     */
    updateSections(sectionId, data) {
        this.data.sectionMap[sectionId] = new Section({
            id: sectionId,
            ...data,
        });
        this.saveAndRenderApp();
    }

    userIsCreator() {
        return game.user.id === this.data.creator;
    }

    async getData() {
        return {
            ...this.data,
            sections: Object.values(this.data.sectionMap),
            user: game.user,
        };
    }

    //this method is simply for handling changing the various headers and labels
    //without them needing to be text inputs
    handleEditableContent(app) {
        // Find all editable content.
        $("[contenteditable=true]")
            // When you click on item, record into data("initialText") content of this item.
            .focus(function () {
                $(this).data("initialText", $(this).html());
            });
        // When you leave an item...
        $("[contenteditable=true]").blur(function () {
            // ...if content is different...
            if ($(this).data("initialText") !== $(this).html()) {
                // ... check if it's the title or a label, then save and render it
                let newData = $(this).html();
                if (this.classList.contains("breakLabel")) {
                    app.breakLabels[this.id] = newData;
                } else if (this.classList.contains("clockName")) {
                    app.name = newData;
                }
                app.saveAndRenderApp();
            }
        });
    }

    //activating all the listeners on the app
    async activateListeners(html) {
        console.log("Activating clock listeners!");
        super.activateListeners(html);
        this.handleEditableContent(this);
        let windowContent = html.closest(".window-content");

        let clockWrapper = windowContent.find(".clockWrapper")[0];

        //make the background wrapper's gradient look like the chosen one
        clockWrapper.style.backgroundImage = this.data.gradient;

        //clicking on the clock wrapper will fill or unfill the sections
        clockWrapper.addEventListener("mousedown", (event) => {
            if (!event.ctrlKey && this.userIsCreator()) {
                if (event.which == 1) {
                    this.data.filledSections++;
                    if (this.data.filledSections > this.data.sectionCount) {
                        this.data.filledSections = this.data.sectionCount;
                    }
                    this.saveAndRenderApp();
                } else if (event.which == 3) {
                    this.data.filledSections--;
                    if (this.data.filledSections < 0) {
                        this.data.filledSections = 0;
                    }
                    this.saveAndRenderApp();
                }
            }
        });

        let sections = windowContent.find(".clockSection");
        let frames = windowContent.find(".frameSection");
        let breakLabels = windowContent.find(".breakLabel");
        let waypoints = windowContent.find(".waypoint");
        let entityLinks = windowContent.find(".entityLink");
        let filled = 0;
        let deleteClockButton = windowContent.find(".delete")[0];
        let shareClock = windowContent.find(".share")[0];

        Array.from(entityLinks).forEach((element) => {
            element.addEventListener("click", async (event) => {
                event.preventDefault();
                let entityType = element.dataset.type;
                let entityId = element.id;
                let ourEntity;
                await HelperFunctions.getEntityById(entityType, entityId).then(
                    (value) => (ourEntity = value)
                );

                if (event.altKey) {
                    //if alt key is pressed, we're going to unlink the entity
                    await unlinkClockFromEntity(ourEntity, this.data.ourId);
                    // this.saveAndRenderApp();
                    return;
                }

                if (entityType == "Scene") {
                    //if it's a scene and we're not already viewing it
                    //view it
                    if (game.scenes.viewed != ourEntity) {
                        ourEntity.view();
                    }
                } else if (ourEntity.sheet) {
                    //else if it's something with a sheet, render that sheet
                    //if it's not already rendered
                    if (!ourEntity.sheet.rendered) {
                        ourEntity.sheet.render(true);
                    }
                }
            });
            element.addEventListener("mouseenter", (event) => {
                if (event.altKey) {
                    $(element).css("backgroundColor", "red");
                }
            });
            element.addEventListener("mouseleave", (event) => {
                $(element).css("backgroundColor", "#252423");
            });
        });
        //delete clock button
        if (deleteClockButton) {
            deleteClockButton.addEventListener("click", async (event) => {
                event.preventDefault();
                //delete us in all our linked entities
                //TODO: Place this back in -- right now linkedEntities only stores the entity type and name
                //TODO: maybe create a helper function that gets the entity in question
                for (let entityId in this.data.linkedEntities) {
                    //special syntax for deleting a specific key in flag objects
                    let ourEntity;
                    await HelperFunctions.getEntityById(
                        this.data.linkedEntities[entityId].entity,
                        entityId
                    ).then((value) => (ourEntity = value));

                    await unlinkClockFromEntity(ourEntity, this.data.ourId);
                }
                //delete us from the saved clocks setting
                //TODO: This should delete from the user saved clocks flag now

                deleteClock(this.data.ourId);
                // let savedClocks = getClocksByUser(game.userId); //game.settings.get("hud-and-trackers", "savedClocks");
                // delete savedClocks[this.data.ourId];
                // game.settings.set("hud-and-trackers", "savedClocks", savedClocks);
                if (game.clockViewer && game.clockViewer.rendered) {
                    //TODO: Find way to delay this until after the clocks are updated
                    game.clockViewer.render(true);
                }
                this.close();
            });
        }
        //share clock button
        if (shareClock) {
            //set the state of the button based on whether or not we're sharing
            //this clock

            //do the event listener for the clock being clicked
            shareClock.addEventListener("click", (event) => {
                event.preventDefault();
                // toggle whether or not it's shared
                if (this.data.shared) {
                    this.data.shared = false;
                    ui.notifications.notify("Stopped sharing clock");
                } else {
                    this.data.shared = true;
                    ui.notifications.notify("Sharing clock");
                }
                this.saveAndRenderApp();
            });
        }
        //adding breaks if we have any
        let sectionsArray = Array.from(sections);
        let framesArray = Array.from(frames);
        breakLabels = Array.from(breakLabels);
        let count = 0;
        //go through all the sub-sections if there are some
        if (this.data.breaks.length > 0) {
            //if breaks is = [2, 1, 2]
            this.data.breaks.forEach((num) => {
                count += num; //count = 2, first time around, 3 second time around, 5 3rd time around
                $(sectionsArray[count - 1]).attr("data-break", true); //(we're subtracting one since array indices start at zero)
            });
            let i = 0;

            for (i = 0; i < this.data.breaks.length; i++) {
                $(framesArray[i]).width((index, currentWidth) => {
                    return currentWidth * this.data.breaks[i];
                });
                $(breakLabels[i]).width((index, currentWidth) => {
                    return currentWidth * this.data.breaks[i];
                });
                $(waypoints[i]).width((index, currentWidth) => {
                    return currentWidth * this.data.breaks[i];
                });
            }
        }

        //refilling the sections if we have any, and adding event listener for click and ctrl click
        sectionsArray.forEach((element) => {
            //refilling the sections after refresh
            if (filled < this.data.filledSections) {
                element.classList.add("filled");
                filled++;
                this.data.sectionMap[element.id].filled = true;
            }

            //clicking on the sections
            if (this.userIsCreator()) {
                element.addEventListener("mousedown", (event) => {
                    if (event.which == 1) {
                        //left click
                        //if the control key is held down, edit the section
                        if (event.ctrlKey) {
                            new SectionConfig({
                                sectionId: element.id,
                                sectionLabel: element.dataset.label,
                                sectionFilled: element.classList.contains("filled"),
                                clockParent: this,
                            }).render(true);
                        }
                    }
                });
                element.addEventListener("mouseenter", (event) => {
                    if (event.ctrlKey) {
                        if (element.classList.contains("filled")) {
                            element.style.backgroundColor = "gray";
                        }
                    }
                });
                element.addEventListener("mouseleave", (event) => {
                    if (element.classList.contains("filled")) {
                        element.style.backgroundColor = "white";
                    }
                });
            }
        });
    }

    /**
     * this will update our app with saved values
     */
    async saveAndRenderApp() {
        if (!this.userIsCreator()) {
            //if we're not the creator
            //just render it and don't save it
            this.render();
            return;
        }

        await updateClock(this.data.ourId, this.data);
        // //get saved clocks from settings

        // let savedClocks = await game.settings.get("hud-and-trackers", "savedClocks");

        // savedClocks[this.data.ourId] = this;

        // //save it back to the settings
        // await game.settings.set("hud-and-trackers", "savedClocks", savedClocks);

        //if we're sharing this, update on other users' ends
        if (this.data.shared) {
            socket.executeForOthers("renderNewClockFromData", this);
        }

        //re-render
        this.render();
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["form", "clockHud"],
            popOut: true,
            submitOnChange: true,
            closeOnSubmit: false,
            minimizable: false,
            resizable: false,
            background: "none",
            template: "modules/hud-and-trackers/templates/clock.html",
            title: "clockHud",
            dragDrop: [{ dragSelector: ".entity", dropSelector: ".contentWrapper" }],
        });
    }
    async _onDrop(event) {
        event.preventDefault();
        console.log("Something dropped");
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (err) {
            return;
        }

        this.linkEntity(data);
        //get drop target
    }

    //link an entity that's dragged onto here
    async linkEntity(data) {
        //set this as a flag on the entity
        let ourEntity;
        await HelperFunctions.getEntityById(data.type, data.id).then(
            (value) => (ourEntity = value)
        );
        console.log(ourEntity);

        if (ourEntity) {
            //add this clock to a flag of the entity

            //save the linked entity on our clock
            //save this entity a linked entity on our clock
            let entityData = {
                name: ourEntity.name,
                entity: ourEntity.entity,
            };
            //get our linked entities, and find the id of this entity, and add the linked entities to this data
            this.data.linkedEntities[data.id] = entityData;

            //make a new object for storing the clock on the entity as well
            const newLinkedClocks = {
                [this.data.ourId]: this.data,
            };

            //set the entity flag *after* the linkedEntities is updated, so that the entity
            //gets the most recent version
            await ourEntity.setFlag("hud-and-trackers", "linkedClocks", newLinkedClocks);
            this.saveAndRenderApp();
        }
    }

    async _updateObject(event, formData) {
        let clockData = await getAllClocks()[this.data.ourId];
        console.log(clockData);
        this.updateEntireClock(clockData, true);
    }
}

//registers the hooks for journal sheets, actor sheets, item sheets
function registerHooks(hookName) {
    Hooks.on(hookName, async (app, html) => {
        console.log("Rendering actor sheet!");
        let linkedClocks = await app.object.getFlag("hud-and-trackers", "linkedClocks");
        //if we have linked clocks
        if (linkedClocks && Object.keys(linkedClocks).length > 0) {
            console.log(
                "🚀 ~ file: clock.js ~ line 422 ~ Hooks.on ~ app",
                app,
                app.element
            );
            app.element.css("position", "relative");
            // $(html[0]).css("position", "relative");
            if (app.element.find(".clock-drawer").length == 0) {
                await showClockDrawer(app, html, linkedClocks);
            }
            // for (let clockId in linkedClocks) {
            //     // renderNewClockFromData(linkedClocks[clockId]);
            // }
        }
    });
}
//show a floating clock drawer on sheets that have linked clocks
async function showClockDrawer(app, html, linkedClocks) {
    console.log("APP ELEMENT IS", app.element);
    let entity = app.object;
    const template =
        "modules/hud-and-trackers/templates/clock-partials/clock-drawer.html";
    var drawerHtml = await renderTemplate(template, {
        clocks: linkedClocks,
        entityType: entity.entity,
    });
    drawerHtml = $(drawerHtml);

    // $(html[0]).append(drawerHtml);
    app.element.append(drawerHtml);

    // drawerHtml.children().each((index) => {
    //     this.mouseenter((event) => {
    //         if (event.altKey) {
    //             this.css("background-color", "red");
    //         }
    //     });
    //     this.mouseleave((event) => {
    //         this.css("background-color", "#252423");
    //     });
    // });
    drawerHtml.on("click", ["data-action"], async (event) => {
        event.preventDefault();
        const clickedElement = event.target;
        //if we have the alt key held down, unlink instead
        if (event.altKey) {
            await unlinkClockFromEntity(entity, clickedElement.id);
            //re-render this sheet and return
            drawerHtml.remove();
            app.render(true);
            return;
        }
        const action = clickedElement.dataset.action;
        let clockData = linkedClocks[clickedElement.id];
        switch (action) {
            case "open": {
                await renderNewClockFromData(clockData);
            }
        }
    });
}

//check if the clock is already rendered
function isClockRendered(clockId) {
    return game.renderedClocks[clockId];
}
//event handler for when the clock is rendered
Hooks.on("renderClock", (app, html) => {
    //if the clock is rendered, add it to our global rendered clocks object
    if (game.renderedClocks[app.data.ourId] == undefined) {
        game.renderedClocks[app.data.ourId] = app;
    }
});
Hooks.on("closeClock", (app, html) => {
    //if the clock is no longer rendered, remove it from our global rendered clocks object
    delete game.renderedClocks[app.data.ourId];
});

//registers the hooks for scenes
function registerSceneHook() {
    Hooks.on("canvasReady", (canvas) => {
        let linkedClocks = canvas.scene.getFlag("hud-and-trackers", "linkedClocks");
        if (linkedClocks) {
            for (let clockId in linkedClocks) {
                renderNewClockFromData(linkedClocks[clockId]);
            }
        }
    });
}
//renders a new clock from saved clock data on an entity or setting
async function renderNewClockFromData(clockData) {
    if (!isClockRendered(clockData.ourId)) {
        await new Clock(clockData).render(true);
    } else {
        game.renderedClocks[clockData.ourId].updateEntireClock(clockData);
        //TODO: Add a way to maximize and bring to focus in the "render" options
    }
}

//external functions for socket to handle internal function of Clock Object
async function saveAndRenderApp(clockApp) {
    clockApp.saveAndRenderApp();
}
async function saveClock(clock) {
    let savedClocks = await game.settings.get("hud-and-trackers", "savedClocks");
    savedClocks[clock.ourId] = clock;
    await game.settings.set("hud-and-trackers", "savedClocks", savedClocks);
}
function getClocksByUser(userId) {
    return game.users.get(userId)?.getFlag("hud-and-trackers", "savedClocks");
}
function getAllClocks() {
    const allClocks = game.users.reduce((accumulator, user) => {
        const userClocks = getClocksByUser(user.id);

        if (userClocks) {
            //if user clocks is defined
            return {
                ...accumulator,
                ...userClocks,
            };
        } else {
            return {
                ...accumulator,
            };
        }
    }, {});
    return allClocks;
}

async function updateClock(clockId, updateData, userId) {
    if (!userId) {
        const relevantClock = getAllClocks()[clockId];
        userId = relevantClock.creator;
    }
    const updateInfo = {
        [clockId]: updateData,
    };
    console.log("🚀 ~ file: clock.js ~ line 550 ~ updateClock ~ updateInfo", updateInfo);
    let user = game.users.get(userId);

    let result = await user.setFlag("hud-and-trackers", "savedClocks", updateInfo);
    console.log(result);
}

async function deleteClock(clockId) {
    const relevantClock = getAllClocks()[clockId];

    const keyDeletion = {
        [`-=${clockId}`]: null,
    };
    let user = game.users.get(relevantClock.creator);
    user.setFlag("hud-and-trackers", "savedClocks", keyDeletion);
}

//remove our clock from the entity's flags
async function unlinkClockFromEntity(ourEntity, clockId) {
    await ourEntity.setFlag("hud-and-trackers", "linkedClocks", {
        [`-=${clockId}`]: null,
    });

    //get the clock and delete the linked entity from the clock
    let clockData = getClocksByUser(game.userId)[clockId];

    let deletion = {
        [clockId]: {
            linkedEntities: {
                [`-=${ourEntity.id}`]: null,
            },
        },
    };
    let result = await game.user.setFlag("hud-and-trackers", "savedClocks", deletion);

    if (isClockRendered(clockId)) {
        let clocks = await game.user.getFlag("hud-and-trackers", "savedClocks");
        let newClockData = clocks[clockId];
        console.log(
            "🚀 ~ file: clock.js ~ line 618 ~ unlinkClockFromEntity ~ newClockData",
            newClockData
        );
        game.renderedClocks[clockId].updateEntireClock(newClockData, true);
    }
}

// ==================================

//sets up hook handlers for all the different entity types
function hookEntities() {
    registerHooks("renderJournalSheet");
    registerHooks("renderActorSheet");
    registerHooks("renderItemSheet");
    registerSceneHook();
}

/** This will be the configuration for the clock itself. */
export class ClockConfig extends FormApplication {
    constructor() {
        super();
    }
    getData() {
        return {};
    }
    async _updateObject(event, formData) {
        let linkedEntities = {};

        let breaks = formData.breaks.split(",");
        breaks = breaks.map((ch) => parseInt(ch));

        //! this will return [""] then [NaN] if it doesn't find anything
        //if we have a number in the breaks array
        if (!Number.isNaN(breaks[0])) {
            //set the section count to the sum of all the sections in each group
            formData.sectionCount = breaks.reduce((previousValue, currentValue) => {
                return previousValue + currentValue;
            });
        } else {
            //if not, set breaks to []
            breaks = [];
        }
        formData.breaks = breaks;

        //initialize the section map to an empty object, and filledSections to zero, and break labels to empty array
        let sectionMap = {};
        let filledSections = 0;
        let breakLabels = {};
        let waypoints = {};

        //loop through and populate the section map with new sections.
        //if start filled is active, set filledSections to the full amount

        if (formData.startFilled) {
            filledSections = formData.sectionCount;
        }

        //generate all sections as section objects to store
        for (let i = 0; i < formData.sectionCount; i++) {
            let sectionID = HelperFunctions.idGenerator();
            let sectionData = {
                id: sectionID,
                label: "",
                filled: formData.startFilled,
            };
            sectionMap[sectionID] = new Section(sectionData);
        }

        //populate the break labels with default strings
        formData.breaks.forEach((el) => {
            let labelId = HelperFunctions.idGenerator();
            breakLabels[labelId] = "Input Label";

            let waypointId = HelperFunctions.idGenerator();
            waypoints[waypointId] = "Waypoint";
        });

        let id = HelperFunctions.idGenerator();

        //get the formData, and then all the extra stuff we had to calculate/generate
        const newClockData = {
            ...formData,
            sectionMap: sectionMap,
            filledSections: filledSections,
            breakLabels: breakLabels,
            waypoints: waypoints,
            linkedEntities: linkedEntities,
            shared: false,
            creator: game.user.id,
            ourId: id,
        };

        //get saved clocks from game settings
        //! let savedClocks = await game.settings.get("hud-and-trackers", "savedClocks");

        //create the clock
        let newClock = new Clock(newClockData);

        updateClock(newClock.data.ourId, newClockData, game.userId);

        //render new clock
        newClock.render(true);

        if (game.clockViewer && game.clockViewer.rendered) {
            //re-render the clock viewer if it's open
            game.clockViewer.render(true);
        }
        this.render();
    }

    activateListeners(html) {
        super.activateListeners(html);
        let windowContent = html.closest(".window-content");
        let gradientDivs = windowContent.find(".gradients")[0].children;
        Array.from(gradientDivs).forEach((element) => {
            if (element.tagName == "DIV") {
                element.addEventListener("click", (event) => {
                    element.querySelector("input").checked = true;
                });
            }
        });
    }
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["form"],
            popOut: true,
            submitOnChange: false,
            closeOnSubmit: true,
            template: "modules/hud-and-trackers/templates/clock-config.html",
            id: "clockConfig",
            title: "Clock Config",
            onSubmit: (e) => e.preventDefault(),
        });
    }
}

class SectionConfig extends FormApplication {
    constructor(sectionData) {
        super();
        ({
            sectionId: this.sectionId,
            sectionLabel: this.sectionLabel,
            sectionFilled: this.sectionFilled,
            clockParent: this.clockParent,
        } = sectionData);
    }
    getData() {
        return {
            sectionLabel: this.sectionLabel,
        };
    }
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["form"],
            popOut: true,
            submitOnChange: false,
            closeOnSubmit: true,
            template: "modules/hud-and-trackers/templates/section-config.html",
            id: "sectionConfig",
            title: "Section Config",
            onSubmit: (e) => e.preventDefault(),
        });
    }
    async _updateObject(event, formData) {
        let data = {
            label: formData.label,
            filled: this.sectionFilled,
        };
        this.clockParent.updateSections(this.sectionId, data);
    }

    activateListeners(html) {
        super.activateListeners(html);
    }

    linkEntityDialogue() {
        let d = new Dialog({
            title: "Link Entity to Clock",
            content: `
			<form class="flexcol">
				<div class="form-group">
					<label for="entityName">Entity Name</label>
					<input type="text" name="entityName" placeholder="Enter entity name">
				</div>
			</form>
			`,
            callback: () => {},
        }).render(true);
    }
}

class Section {
    constructor(sectionData) {
        ({ id: this.id, label: this.label, filled: this.filled } = sectionData);
    }
    static fromJSON(obj) {
        if (typeof obj == "string") {
            obj = JSON.parse(obj);
        }
        return new Section(...obj);
    }
}

/**
 * Define your class that extends FormApplication
 */
export class ClockViewer extends FormApplication {
    constructor() {
        super();
        let savedClocks = getClocksByUser(game.userId); //game.settings.get("hud-and-trackers", "savedClocks");
        this.clocks = savedClocks;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["form"],
            popOut: true,
            submitOnChange: false,
            closeOnSubmit: false,
            template: `modules/hud-and-trackers/templates/clock-viewer.html`,
            id: "clockViewer",
            title: "Clock Viewer",
        });
    }

    async getData() {
        let savedClocks = getClocksByUser(game.userId); //await game.settings.get("hud-and-trackers", "savedClocks");
        this.clocks = Object.values(savedClocks);
        // Send data to the template
        return {
            clocks: this.clocks,
        };
    }

    async activateListeners(html) {
        super.activateListeners(html);
        let savedClocks = getClocksByUser(game.userId); //await game.settings.get("hud-and-trackers", "savedClocks");
        this.clocks = savedClocks;
        html.on("click", ["data-action"], this._handleButtonClick);
        // html.on("click", "button", this._handleButtonClick);
    }

    async _handleButtonClick(event) {
        event.preventDefault();
        let savedClocks = getClocksByUser(game.userId); //await game.settings.get("hud-and-trackers", "savedClocks");
        this.clocks = savedClocks;

        const clickedElement = event.target;
        const action = clickedElement.dataset.action;

        let clockData = savedClocks[clickedElement.id];

        switch (action) {
            case "open": {
                await new Clock(clockData).render(true);
            }
        }
    }

    async _updateObject(event, formData) {}
}
