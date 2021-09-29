"use strict";

let hud;
let lastTab = "attacks";
let controlled = false;
let inCombat = false;
let whoseTurn = "fastPlayerTurn";
let fastPlayers = []
let enemies = []
let npcAllies = []
let slowPlayers = []
let addedRepTokens = false;





Handlebars.registerHelper("clean", function (strInputCode) {
	let cleanText = strInputCode.replace(/<\/?[^>]+(>|$)/g, "");
	cleanText = cleanText.replace("&quot;", "\"");

	cleanText = cleanText.replace("&amp;", "&");

	cleanText = cleanText.replace("&rsquo;", "’");
	cleanText = cleanText.replace("&nbsp;", " ");

	return cleanText;
});

function getEnemyLevels() {

}

function getCanvasToken(id) {
	return canvas.tokens.get(id);
}

function getGameActor(id) {
	return game.actors.get(id);
}

function findInFolder(folder, name) {
	console.log(folder.content)
	let item = folder.content.find((actor) => {
		console.log(actor);
		return actor.name == name
	})
	console.log(item);
	return item;
}

async function createToken(ourActor){
	let tokenDoc = await Token.create(ourActor.data.token);
	let tokenObject = tokenDoc[0]._object;
	return tokenObject;
}

Hooks.on("updateCombat", async (combat, roundData, diff) => {
	//first round, categories all the combatants
	if (game.combat.current.round == 1 && !addedRepTokens) {
		await combat.rollAll();
		let enemies = combat.turns.filter((combatant) => {
			let token = combatant._token;
			if (token.data.disposition == -1) {
				return true;
			}
		});
		let npcAllies = combat.turns.filter((combatant) => {
			let token = combatant._token;
			if (token.data.disposition == 0) {
				return true;
			}
		})
		let highestEnemyInitiative = 0;
		for (let enemy of enemies) {
			if (enemy.initiative > highestEnemyInitiative) {
				highestEnemyInitiative = enemy.initiative;
			}
		}
		let playersToRemove = [];
		for (let combatant of combat.turns) {
			if (!combatant.isNPC) {
				if (combatant.initiative >= highestEnemyInitiative) {
					fastPlayers.push(combatant._token);
					playersToRemove.push(combatant.id);
				} else if (combatant.initiative < highestEnemyInitiative) {
					slowPlayers.push(combatant._token);
					playersToRemove.push(combatant.id);
				}
			}
			//TODO: maybe store these in a flag on the combat?
			console.log(fastPlayers);
			console.log(slowPlayers);
		}
		//delete the combatants
		await combat.deleteEmbeddedDocuments("Combatant", playersToRemove);

		//set level to NPC level
		//TODO: Add representative tokens
		let repTokens = game.folders.getName("RepTokens");
		let representativeTokens = []
		for(let repTokenActor of repTokens.content){
			let newToken;
			if(repTokenActor.name == "FastPlayer" && fastPlayers.length > 0){
				newToken = createToken(repTokenActor);
			}
			else if(repTokenActor.name == "SlowPlayer" && slowPlayers.length > 0){
				newToken = createToken(repTokenActor);
			}
			else if(repTokenActor.name == "NPCAllies" && npcAllies.length > 0){
				newToken = createToken(repTokenActor);
			}
			if(newToken){
				representativeTokens.push(newToken);
			}
		}
		for(let token of representativeTokens){
			token.toggleCombat();
		}

		if (fastPlayers.length > 0) {
			let fastPlayerTK = findInFolder(repTokens, "FastPlayer");
			console.log(fastPlayerTK);
			if(fastPlayerTK){
				let fastPlayerToken = createToken(fastPlayerTK);
				fastPlayerToken.toggleCombat();
			}
		}
		if (slowPlayers.length > 0) {
			let slowPlayerTK = findInFolder(repTokens, "SlowPlayer");
			console.log(slowPlayerTK);
			if(slowPlayerTK){
				let slowPlayerTokenDoc = await Token.create(slowPlayerTK.data.token);
				let slowPlayerToken = slowPlayerTokenDoc[0]._object;
				slowPlayerToken.toggleCombat();
			}
		}
		if (npcAllies.length > 0) {
			let npcAlliesTK = findInFolder(repTokens, "NPCAllies");
			console.log(npcAlliesTK);
			if(npcAlliesTK){
				let npcTokenDoc = await Token.create(npcAlliesTK.data.token);
				let npcToken = npcToken[0]._object;
				npcToken.toggleCombat();
			}
		}
		let enemiesTK = findInFolder(repTokens, "Enemies");
		let enemyToken = await Token.create(enemiesTK.data.token);
		console.log(enemyToken);
		enemyToken[0]._object.toggleCombat();

	}



	//if we're in combat but we haven't toggled inCombat to true
	if (combat.current.round > 0 && !inCombat) {
		inCombat = true;
	}
	let token = canvas.tokens.get(combat.current.tokenId);
	let actor = game.actors.get(token.data.actorId);
	if (actor) {
		if (actor.data.type == "PC") {
			console.log("Player turn!");
			whoseTurn = "fastPlayerTurn"
		} else {
			console.log(token.data.disposition);
			if (token.data.disposition == -1) {
				console.log("Enemy turn!");
				whoseTurn = "enemyTurn"
			} else if (token.data.disposition == 0) {
				console.log("Neutral turn!");
			} else if (token.data.disposition == 1) {
				console.log("Ally turn!");
			}
		}
	} else {
		console.log("Combatant has no actor");
	}
});

Hooks.on("deleteCombat", (combat) => {
	inCombat = false;
})

/**
 * @param token - the token we've selected
 * @param isControlled - if the token is controlled or we've stopped
 * controlling it
 */


Hooks.on("controlToken", (token, isControlled) => {

	let ourToken = token;

	if (isControlled) {

		//if we're controlling the token, render a new token hud
		//TODO: PUT THIS BACK IN 
		// hud = new Hud(ourToken).render(true);

	} else {
		//if we're no  longer controlling the token, and hud has been
		//initialized, close the hud
		if (hud) {
			hud.close();
		}
	}
})

function itemRollMacro(actor, itemID, pool, skill, assets, effort1, effort2, additionalSteps, additionalCost, damage, effort3, damagePerLOE, teen, stepModifier, noRoll) {
	// Find actor based on item ID
	const owner = game.actors.find(actor => actor.items.get(itemID));

	// Check for actor that owns the item
	if (!actor || actor.data.type != "PC") return ui.notifications.warn(game.i18n.format("CYPHERSYSTEM.MacroOnlyUsedBy", {
		name: owner.name
	}));

	// Determine the item based on item ID
	const item = actor.items.get(itemID);

	// Check whether the item still exists on the actor
	if (item == null) return ui.notifications.warn(game.i18n.format("CYPHERSYSTEM.MacroOnlyUsedBy", {
		name: owner.name
	}));

	// Check for AiO dialog
	let skipDialog = true;
	if ((game.settings.get("cyphersystem", "itemMacrosUseAllInOne") && !event.altKey) || (!game.settings.get("cyphersystem", "itemMacrosUseAllInOne") && event.altKey)) {
		skipDialog = false;
	};

	// Check for noRoll
	if (!noRoll) noRoll = false;

	// Prepare data
	// Prepare defaults in case none are set by users in the macro
	if (!skill) {
		if (item.type == "skill" || item.type == "teen Skill") {
			skill = item.data.data.skillLevel;
		} else if (item.type == "attack" || item.type == "teen Attack") {
			skill = item.data.data.skillRating;
		} else {
			skill = item.data.data.rollButton.skill;
		}
	}
	if (!assets) assets = item.data.data.rollButton.assets;;
	if (!effort1) effort1 = item.data.data.rollButton.effort1;
	if (!effort2) effort2 = item.data.data.rollButton.effort2;
	if (!effort3) effort3 = item.data.data.rollButton.effort3;
	if (!additionalCost) {
		if (item.type == "ability" || item.type == "teen Ability") {
			let checkPlus = item.data.data.costPoints.slice(-1)
			if (checkPlus == "+") {
				let cost = item.data.data.costPoints.slice(0, -1);
				additionalCost = parseInt(cost);
			} else {
				let cost = item.data.data.costPoints;
				additionalCost = parseInt(cost);
			}
		} else {
			additionalCost = item.data.data.rollButton.additionalCost;
		}
	}
	if (!additionalSteps) {
		if (item.type == "power Shift") {
			additionalSteps = item.data.data.powerShiftValue;
		} else if (item.type == "attack" || item.type == "teen Attack") {
			additionalSteps = item.data.data.modifiedBy;
		} else {
			additionalSteps = item.data.data.rollButton.additionalSteps;
		}
	}
	if (!damage) {
		if (item.type == "attack" || item.type == "teen Attack") {
			damage = item.data.data.damage;
		} else {
			damage = item.data.data.rollButton.damage;
		}
	}
	if (!pool) {
		if (item.type == "ability" || item.type == "teen Ability") {
			pool = item.data.data.costPool;
		} else {
			pool = item.data.data.rollButton.pool;
		}
	}
	if (!damagePerLOE) damagePerLOE = item.data.data.rollButton.damagePerLOE;
	if (!stepModifier) {
		if (item.type == "attack" || item.type == "teen Attack") {
			stepModifier = item.data.data.modified;
		} else {
			stepModifier = (additionalSteps < 0) ? "hindered" : "eased";
		}
	}
	if (!teen) teen = (actor.data.data.settings.gameMode.currentSheet == "Teen") ? true : false;

	// Create item type
	let itemType = "";
	if (item.type == "ability" && item.data.data.spell) {
		itemType = game.i18n.localize("CYPHERSYSTEM.Spell") + ": ";
	} else if ((item.type == "ability" || item.type == "teen Ability") && !item.data.data.spell) {
		itemType = game.i18n.localize("ITEM.TypeAbility") + ": ";
	} else if (item.type == "attack" || item.type == "teen Attack") {
		itemType = game.i18n.localize("ITEM.TypeAttack") + ": ";
	} else if (item.type == "skill" || item.type == "teen Skill") {
		itemType = game.i18n.localize("ITEM.TypeSkill") + ": ";
	}

	game.cyphersystem.allInOneRollDialog(actor, pool, skill, assets, effort1, effort2, additionalCost, Math.abs(additionalSteps), stepModifier, itemType + item.name, damage, effort3, damagePerLOE, teen, skipDialog, noRoll, itemID);
	// Parse data to All-in-One Dialog
}

/*APPLY TURN FINISHED OVERLAY */
function turnFinishedOverlay() {
	const effect = "icons/svg/skull.svg";
	canvas.tokens.controlled.forEach(token => {
		token.toggleOverlay(effect);
	});
}

export class Hud extends Application {
	constructor(object) {
		// super(object);
		super();
		this.ourToken = object;
		this.ourActor = this.getActor(this.ourToken);
		this.attacks = this.getAttacks(this.ourToken);
		this.skills = this.getSkills(this.ourToken);
		this.abilities = this.getAbilities(this.ourToken);
		this.showTab = lastTab;
		this.combatActive = inCombat;
	}
	/** @override */
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			// classes: ['form'],
			popOut: true,
			submitOnChange: false,
			closeOnSubmit: false,
			minimizable: false,
			resizable: true,
			background: "none",
			template: 'modules/hud-and-trackers/templates/hud.html',
			id: 'tokenHud',
			title: 'tokenHud',
			onSubmit: (e) => e.preventDefault(),
		});
	}
	async _updateObject(event, formData) {

		console.log(formData);
		this.render();
	}

	getData() {
		return {
			ourToken: this.ourToken,
			ourActor: this.ourActor,
			attacks: this.attacks,
			skills: this.skills,
			abilities: this.abilities,
			showTab: this.showTab,
			combatActive: this.combatActive
		};
	}

	activateListeners(html) {
		// super.activateListeners(html);
		let windowContent = html.closest(".window-content");
		let attackButton = windowContent.find(".showAttacks")[0];
		let skillsButton = windowContent.find(".showSkills")[0];
		let abilitiesButton = windowContent.find(".showAbilities")[0];


		attackButton.addEventListener("click", (event) => {
			event.preventDefault();
			this.showTab = "attacks";
			lastTab = "attacks";
			this.render(true);
		})


		skillsButton.addEventListener("click", (event) => {
			event.preventDefault();
			// event.preventDefault();
			this.showTab = "skills";
			lastTab = "skills";
			this.render(true);
		});

		abilitiesButton.addEventListener("click", (event) => {
			event.preventDefault();
			event.preventDefault();
			this.showTab = "abilities";
			lastTab = "abilities";
			this.render(true);
		});

		let hudItems = windowContent.find("div.hud-item");

		for (let hudItem of hudItems) {
			//if we have an actor connected, get it
			let actor = this.getActor(this.ourToken);

			if (actor) {
				if (actor.data.type == "PC") {
					hudItem.addEventListener("click", (event) => {
						event.preventDefault();
						let item = actor.data.items.find(i => i.id === event.currentTarget.id);
						this.rollAllInOne(item, actor);
					})
				} else if (actor.data.type == "NPC") {
					hudItem.addEventListener("click", (event) => {
						event.preventDefault();
						console.log(event.currentTarget.id);
						let item = actor.data.items.find(i => i.id === event.currentTarget.id);
						item.sheet.render(true);
					})
				}
			}
		}
	}

	rollAllInOne(foundItem, actor) {
		itemRollMacro(actor, foundItem.id, "", "", "", "", "", "", "", "", "", "", "", "", false);
	}

	getActor(ourToken) {
		if (ourToken.data.actorLink) {
			return game.actors.get(ourToken.data.actorId);
		} else {
			return null;
		}
	}

	getAttacks(ourToken) {
		if (ourToken.data.actorLink) {
			let actor = game.actors.get(ourToken.data.actorId);
			// console.log(actor.data.items);
			let attacks = actor.data.items.contents.filter((item) => {
				return item.data.type === "attack";
			});
			return attacks.sort();
		}
	}
	getSkills(ourToken) {
		if (ourToken.data.actorLink) {
			let actor = game.actors.get(ourToken.data.actorId);
			// console.log(actor.data.items);
			let skills = actor.data.items.contents.filter((item) => {
				return item.data.type === "skill";
			});
			return skills.sort();
		}
	}
	getAbilities(ourToken) {
		if (ourToken.data.actorLink) {
			let actor = game.actors.get(ourToken.data.actorId);
			// console.log(actor.data.items);
			let abilities = actor.data.items.contents.filter((item) => {
				return item.data.type === "ability";
			});
			return abilities.sort();
		}
	}
}
window.hud = hud;