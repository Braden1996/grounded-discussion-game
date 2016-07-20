let cyto_helpers = require("../../util/cytoscape-helpers.js");
let discuss = require("../discuss/main.js");
let rules = require("./rules.js");
let ifShowHide = require("../../util/ifshowhide.js");

// Save a little bit of screenspace...
let MOVES = rules.MOVES;
let getMoveClass = rules.getMoveClass;
let ROUND_STATES = rules.ROUND_STATES;

let MOVE_STRINGS = {};
MOVE_STRINGS[MOVES["HTB"]]     = "HTB";
MOVE_STRINGS[MOVES["CB"]]      = "CB";
MOVE_STRINGS[MOVES["CONCEDE"]] = "CONCEDE";
MOVE_STRINGS[MOVES["RETRACT"]] = "RETRACT";

function updateDom(cy) {
	ifShowHide("data-grounded", "ifcanplay", cy.app_data.grounded["possible"]);
	ifShowHide("data-grounded", "ifplaying",
		cy.app_data.grounded["possible"] &&
		cy.app_data.grounded["state"] !== ROUND_STATES["UNKNOWN"]
	);

	ifShowHide("data-grounded", "ifmoves<1", cy.app_data.grounded["move_stack"].length < 1);
	ifShowHide("data-grounded", "ifmoves==1", cy.app_data.grounded["move_stack"].length === 1);
	ifShowHide("data-grounded", "ifmoves>1", cy.app_data.grounded["move_stack"].length > 1);

	let is_proponent = $("[data-grounded='proponent']").hasClass("m-button--switch__li--active");

	ifShowHide("data-grounded", "ifproponent", is_proponent);
	ifShowHide("data-grounded", "ifaiturn",
		cy.app_data.grounded["possible"] &&
		cy.app_data.grounded["move_stack"].length >= 1 &&
		(is_proponent !== rules.isProponentsTurn(cy.app_data.grounded["node_stack"])) &&
		cy.app_data.grounded["state"] === ROUND_STATES["PLAYING"]
	);
}

function buildLogMoveMessage(the_move, node, is_proponent) {
	return (is_proponent ? "P) " : "O)") +
		("<em>" + MOVE_STRINGS[the_move] + "</em>(") +
		("<em>" + node.id() + "</em>)");
}

function parseMoveString(cy, str) {
	str = str.replace("(", " ");
	str = str.replace(")", "");

	let tokens = str.split(" ");
	let move = MOVES[tokens.splice(0, 1)[0].toUpperCase()];
	let node_id = tokens.join(" ");
	let node = cy.nodes().filter((i, ele) => ele.id() === node_id).first();
	return [move, node];
}

function startGame(cy, startGameCallback) {
	startGameCallback(cy);

	$("[data-grounded-movelist]").empty();
	discuss.clearDiscuss(cy);

	// Disable delete mode
	let delete_button = $("[data-switch-graph-delete]");
	if (delete_button.hasClass("m-button--switch__li--active")) {
		delete_button.closest(".m-button--switch").click();
	}

	updateDom(cy);
}

function endGame(cy, endGameCallback) {
	endGameCallback(cy);

	if (!$("[data-grounded='start']").hasClass("m-button--switch__li--active")) {
		$("[data-grounded='start']").closest(".m-button--switch").click();
	}

	$("[data-grounded-movelist]").empty();
	updateDom(cy);
}

function PostMove(moveObject) {
	// SHAME: awful hacky way to prevent our alert prompts from blocking Cytoscape
	// from rendering the frame corresponding with the most recent move.
	window.setTimeout(() => {
		if (moveObject["node"] !== undefined) {
			let cy = cyto_helpers.getCy(moveObject["node"]);

			updateDom(cy);

			if (moveObject["valid"]) {
				let log_str = buildLogMoveMessage(moveObject["move"], moveObject["node"], moveObject["is_proponent"]);
				$("[data-grounded-movelist]").append("<li>" + log_str + "</li>");

				if (cy.app_data.grounded["state"] !== ROUND_STATES["PLAYING"]) {
					let end_msg = "The game has terminated for some unknown reason.";
					switch (cy.app_data.grounded["state"]) {
						case ROUND_STATES["INITIAL_CONCEDED"]:
							end_msg = "The Proponent has won as their initial argument has been conceded!";
							break;
						case ROUND_STATES["HTB/CB_REPEAT"]:
							end_msg = "The OPPONENT has won as a HTB/CB repeat has occurred!";
							break;
						case ROUND_STATES["CB_EMPTY_ATTACKERS"]:
							end_msg = "The OPPONENT has won as their last CB argument has no valid attackers!";
							break;
					}

					$("[data-grounded-movelist]").append("<li>" + end_msg + "</li>");
					alert(end_msg);
				}
			} else {
				if (cy.app_data.grounded["state"] === ROUND_STATES["PLAYING"]) {
					alert("That is an invalid move!");
				} else {
					alert("The game has already ended!");
				}
			}
		}
	}, 50);
}

function parseCytoscapeInstance(cy, playgame_exports) {
	cy.app_data.grounded["possible"] = false;

	updateDom(cy); // Inital update

	let graphUpdated = function(evt) {
		evt.cy.app_data.grounded["possible"] = true;

		if (evt.cy.app_data.grounded["state"] !== ROUND_STATES["UNKNOWN"]) {
			endGame(evt.cy, playgame_exports.endGameCallback);
		} else {
			updateDom(evt.cy);
		}
	}

	cy.on("remove", graphUpdated);
	cy.on("add", graphUpdated);

	cy.on("tap", "node", (evt) => {
		if (evt.cy.app_data.grounded["state"] !== ROUND_STATES["UNKNOWN"]) {
			let is_proponent = $("[data-grounded='proponent']").hasClass("m-button--switch__li--active");
			let moveObject = playgame_exports.autoMove(evt.cyTarget, is_proponent);
			PostMove(moveObject);
		}
	});

	$("[data-grounded-moveinput]").keyup(function(e) {
		if (e.keyCode === 13){
			let [move, node] = parseMoveString(cy, $(this).val());
			let is_proponent = $("[data-grounded='proponent']").hasClass("m-button--switch__li--active");
			let moveObject = playgame_exports.move(move, node, is_proponent);
			PostMove(moveObject);

			$(this).val("");
		}
	});

	$("[data-grounded='start']").on("m-button-switched", (evt, is_on) => {
		if (is_on) {
			endGame(cy, playgame_exports.endGameCallback);
		} else {
			startGame(cy, playgame_exports.startGameCallback);
		}
	});

	$("[data-grounded-moveai]").click(function() {
		let is_proponent = $("[data-grounded='proponent']").hasClass("m-button--switch__li--active");
		let moveObject = playgame_exports.strategyMove(cy.app_data.grounded["node_stack"], !is_proponent);
		PostMove(moveObject);
	});

	$("[data-grounded-undo]").click(function() {
		if (cy.app_data.grounded["state"] !== ROUND_STATES["PLAYING"]) {
			$("[data-grounded-movelist] > li:last").remove();
		}

		let moveObject = playgame_exports.undoLastMove(cy.app_data.grounded["node_stack"]);
		$("[data-grounded-movelist] > li:last").remove();
		updateDom(cy);
	});

	$("[data-grounded='proponent']").on("m-button-switched", (evt, is_on) => updateDom(cy));

	$("[data-switch-graph-delete]").on("m-button-switched", (evt, is_on) => {
		if (is_on) {
			endGame(cy, playgame_exports.endGameCallback);
		}
	});

	return cy;
}

module.exports = {
	"parseCytoscapeInstance": parseCytoscapeInstance
}