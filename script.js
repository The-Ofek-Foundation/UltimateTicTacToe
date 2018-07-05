/**
 * Move containing x and y coord
 *
 * @typedef {Array.<number, number>} move
 */

/**
 * 2d Array representing board
 *
 * @typedef {number[][]} board
 */

var docWidth, docHeight;
var boardWidth, squareWidth;
var board;
var globalRoot;
var expansionConstant;
// bound: ~0.0156
var aiTurn;
var over;
var prevMove;
var xTurnGlobal;
var ponder, pondering;
var timeToThink;
var certaintyThreshold = 0.05;
var wrapperTop;
var numChoose1, numChoose2, numChoose3, lnc1, lnc2, lnc3, stopChoose;
var anti, tie;
var workers, workersCallbackCount;

var boardui = getElemId("board");
var brush = boardui.getContext("2d");
var totalEmptyGlobal, emptySpotsGlobal;
var drawWeights, hoveredMove;
var analElem = getElemId('anal'), numTrialsElem = getElemId('num-trials');
var gameSettingsMenu = getElemId('game-settings-menu');

var boardHistory;
var maxState, currState;

/**
 * Automatically called once page elements are loaded. Sets location of elements in page and prompts how to change settings.
 */
function pageReady() {
	resizeBoard();
	newGame();
	setTimeout(resizeSettingsTable, 0);

	console.log("HEYA");
	setTimeout(function() {
		var explainSettings = getSessionData('utttettingsExplained');
		if (!explainSettings) {
			explainGameRules();
			setSessionData('utttettingsExplained', true);
		}
	}, 100);
}

function explainGameRules() {
	showInfoModal("Ultimate Tic Tac Toe Rules",
		"Welcome to my Ultimate Tic Tac Toe game, I hope you enjoy it and I welcome all feedback!",
		"If you don't know how to play this game, I highly recommend checking out the <a target='_blank' href='https://en.wikipedia.org/wiki/Ultimate_tic-tac-toe'>Wikipedia page</a> I made for it!",
		"To view the settings, type 's', and for a new game, 'n', or hit the buttons on the top navbar.",
		"I hope you enjoy this fun little challenge!"
	);
}


function resizeBoard() {
	docWidth = getElemWidth(contentWrapper);
	docHeight = getElemHeight(contentWrapper);
	wrapperTop = contentWrapper.offsetTop;

	boardWidth = docWidth < docHeight ? docWidth:docHeight;

	setElemWidth(boardui, boardWidth);
	setElemHeight(boardui, boardWidth);
	setElemStyle(boardui, 'left', (docWidth - boardWidth) / 2 + "px")
	setElemStyle(boardui, 'top', (docHeight - boardWidth) / 2 + "px")
	boardui.setAttribute('width', boardWidth);
	boardui.setAttribute('height', boardWidth);
	squareWidth = boardWidth / 9;
	resizeSettingsTable();
}

/**
 * Called on window resize.
 * Resizes elements for new window size.
 */
function onResize() {
	resizeBoard();
	drawBoard();
}

/**
 * Creates and starts a new game of UltimateTicTacToe.
 */
function newGame() {
	over = false;
	prevMove = false;
	board = new Array(9);
	for (var i = 0; i < board.length; i++) {
		board[i] = new Array(9);
		for (var a = 0; a < board[i].length; a++)
			board[i][a] = 0;
	}

	getSettings();
	populateSettingsForm(gameSettings.getSettings());

	expansionConstant = anti ? 1.581328125:1.03125;

	numChoose1 = numChoose2 = numChoose3 = lnc1 = lnc2 = lnc3 = stopChoose = false;

	xTurnGlobal = true;
	totalEmptyGlobal = 9 * 9;
	emptySpotsGlobal = getEmptySpots(board);
	hoveredMove = false;
	maxState = currState = 0;
	boardHistory = new Array(totalEmptyGlobal);
	saveBoard();

	globalRoot = createMCTSRoot();
	drawBoard();

	if (((aiTurn === 'first') === xTurnGlobal) || aiTurn === 'both')
		setTimeout(playAIMove, 20);

	stopPonder();
	if (ponder)
		startPonder();
}

/**
 * Gets game settings, or sets them to default value if not existent.
 */
function getSettings() {
	aiTurn = gameSettings.getOrSet('aiTurn', 'second');
	ponder = gameSettings.getOrSet('ponder', false);
	drawWeights = gameSettings.getOrSet('drawWeights', false);
	anti = gameSettings.getOrSet('anti', false);
	tie = gameSettings.getOrSet('tie', false);
	timeToThink = gameSettings.getOrSet('timeToThink', 1);
}

function saveBoard() {
	boardHistory[currState++] = {
		'board': simpleBoardCopy(board),
		'xTurnGlobal': xTurnGlobal,
		'playMoveGlobal': playMoveGlobal,
		'totalEmptyGlobal': totalEmptyGlobal,
		'emptySpotsGlobal': simpleSpotsCopy(emptySpotsGlobal),
		'prevMove': prevMove,
		'over': over,
	};
	maxState = currState;
}

function loadBoard(index) {
	board = simpleBoardCopy(boardHistory[index].board);
	xTurnGlobal = boardHistory[index].xTurnGlobal;
	playMoveGlobal = boardHistory[index].playMoveGlobal;
	totalEmptyGlobal = boardHistory[index].totalEmptyGlobal;
	emptySpotsGlobal = simpleSpotsCopy(boardHistory[index].emptySpotsGlobal);
	prevMove = boardHistory[index].prevMove;
	over = boardHistory[index].over;
	currState = index + 1;
	globalRoot = createMCTSRoot();
}

function undo() {
	if (currState <= 1 || aiTurn === 'both') {
		console.error("Cannot undo");
		return false;
	}
	loadBoard(currState - (aiTurn === 'null' ? 2:3));
	drawBoard();
	return true;
}

function redo() {
	if (currState == maxState || aiTurn === 'both') {
		console.error("Cannot redo");
		return false;
	}
	loadBoard(currState + (aiTurn === 'null' ? 0:1));
	drawBoard();
	return true;
}


/**
 * Clears the board.
 */
function clearBoard() {
	brush.clearRect(0, 0, boardWidth, boardWidth);
	brush.fillStyle = "white";
	brush.fillRect(0, 0, boardWidth, boardWidth);
}

/**
 * Draws the lines of the grid, shading in regions where next move forced.
 */
function drawGrid() {
	var i, a;

	if (drawWeights && globalRoot.totalTries > 0) {
		var bestChild = mostTriedChild(globalRoot, null), bestTries;
		if (bestChild !== null) {
			bestTries = bestChild.totalTries;
			for (i = 0; i < 9; i++)
				for (a = 0; a < 9; a++) {
					var squareRoot = MCTSGetNextRoot([i, a]);
					if (squareRoot !== null) {
						brush.fillStyle = getWeightedStyle(bestTries, squareRoot.totalTries, xTurnGlobal);
						brush.fillRect(i * squareWidth, a * squareWidth, squareWidth, squareWidth);
					}
				}
		}
	}

	if ((!drawWeights || globalRoot.totalTries === 0) && prevMove && !over) {
		var nextCenter = [prevMove[0] % 3 * 3 + 1, prevMove[1] % 3 * 3 + 1];

		if (board[nextCenter[0]][nextCenter[1]] < 3 && xTurnGlobal) {
			brush.fillStyle = "rgba(102, 162, 255, 0.5)";
			brush.fillRect((nextCenter[0] - 1) * squareWidth, (nextCenter[1] - 1) * squareWidth, 3 * squareWidth, 3 * squareWidth);
		} else if (board[nextCenter[0]][nextCenter[1]] < 3 && !xTurnGlobal) {
			brush.fillStyle = "rgba(255, 123, 123, 0.5)";
			brush.fillRect((nextCenter[0] - 1) * squareWidth, (nextCenter[1] - 1) * squareWidth, 3 * squareWidth, 3 * squareWidth);
		}
	}

	brush.lineWidth = 5;
	brush.strokeStyle = "black";
	brush.beginPath();
	for (i = squareWidth * 3; i < boardWidth; i += squareWidth * 3) {
		brush.moveTo(i, 0);
		brush.lineTo(i, boardWidth);
	}
	for (a = squareWidth * 3; a < boardWidth; a += squareWidth * 3) {
		brush.moveTo(0, a);
		brush.lineTo(boardWidth, a);
	}
	brush.stroke();
	brush.closePath();

	brush.lineWidth = 1;
	brush.beginPath();
	for (i = squareWidth; i < boardWidth - 1; i += squareWidth) {
		brush.moveTo(i, 0);
		brush.lineTo(i, boardWidth);
	}
	for (a = squareWidth; a < boardWidth - 1; a += squareWidth) {
		brush.moveTo(0, a);
		brush.lineTo(boardWidth, a);
	}
	brush.stroke();
	brush.closePath();
}

function getWeightedStyle(bestTries, tries, xTurn) {
	if (xTurn)
		return "rgba(102, 162, 255, " + tries / bestTries + ")";
	else return "rgba(255, 123, 123, " + tries / bestTries + ")";
}

/**
 * Draws a specific tic tac toe piece in the correct location.
 * @param  {number} x coord of piece on board
 * @param  {number} y coord of piece on board
 */
function drawPiece(x, y) {
	var o4 = squareWidth / 4;
	var color;
	switch(board[x][y]) {
		case 1: case 3:
			color = 'x';
			break;
		case 2: case 4:
			color = 'o';
			break;
		case 5:
			color = 'X';
			break;
		case 6:
			color = 'O';
			break;
		default:
			return;
	}
	brush.textAlign = 'center';
	switch (color) {
		case 'x': case 'X':
			brush.fillStyle = "#1C86EE";
			break;
		case 'o': case 'O':
			o4 *= 1.1;
			brush.fillStyle = "red";
			break;
		default: return;
	}

	switch (color) {
		case 'x': case 'o':
			brush.font = squareWidth + "px Arial";
			brush.fillText(color + "", x * squareWidth + squareWidth / 2, (y + 1) * squareWidth - o4);
			break;
		case 'X': case 'O':
			brush.font = (squareWidth * 3) + "px Arial";
			brush.fillText(color + "", Math.floor(x / 3) * squareWidth * 3 + squareWidth * 1.5, Math.floor(y / 3 + 1) * squareWidth * 3 - o4 * 1.5);
			break;
		default: return;
	}
	brush.fill();
}

/**
 * Draws the tic tac toe board in its current state.
 */
function drawBoard() {
	clearBoard();
	drawGrid();
	updateAnalysis();

	for (var I = 1; I < 9; I+=3)
		for (var A = 1; A < 9; A+=3)
			if (board[I][A] === 5 || board[I][A] === 6)
				drawPiece(I, A);
			else for (var i = I-1; i <= I+1; i++)
				for (var a = A-1; a <= A+1; a++)
					if (board[i][a] !== 0)
						drawPiece(i, a);
}

/**
 * Draws the board with a piece filled in (when hovering over)
 * @param  {move} move array containing move x and y coords
 */
function drawHover(move) {
	board[move[0]][move[1]] = xTurnGlobal ? 1:2;
	drawBoard();
	board[move[0]][move[1]] = 0;
}

/**
 * Gets corresponding move from mouse x and y locations
 * @param  {number} xloc mouse x coord
 * @param  {number} yloc mouse y coord
 * @return {move} array containing move x and y coords
 */
function getMove(xloc, yloc) {
	var left = (docWidth - boardWidth) / 2;
	var top = (docHeight - boardWidth) / 2;
	if (xloc < left || xloc > left + boardWidth || yloc < top || yloc > boardWidth + top)
		return [-1, -1];
	return [Math.floor((xloc - left) / squareWidth), Math.floor((yloc - top) / squareWidth)];
}

/**
 * Checks if a move is legal
 * @param  {board}   tboard   the board
 * @param  {move}    move     array containing move x and y coords
 * @param  {move}    prevMove array containing move x and y coords of last move played
 * @param  {boolean} output   whether or not to show alert output
 * @return {boolean} true if move is legal
 */
function legalMove(tboard, move, prevMove, output) {
	if (move[0] < 0 || move[1] < 0)
		return false;
	if (board[move[0]][move[1]] !== 0)
		return false;
	if (tboard[move[0] - move[0] % 3 + 1][move[1] - move[1] % 3 + 1] > 2) {
		if (output)
			alert("Square already finished");
		return false;
	}
	if (prevMove) {
		if ((tboard[prevMove[0] % 3 * 3 + 1][prevMove[1] % 3 * 3 + 1] < 3) && (prevMove[0] % 3 !== Math.floor(move[0] / 3) || prevMove[1] % 3 !== Math.floor(move[1] / 3))) {
			if (output)
				alert("Wrong square!");
			return false;
		}
	}
	return true;
}

/**
 * Returns true if can place there because center is legal, false otherwise
 * @param  {board} tboard 2
 * @param  {move}  move   array containing move x and y coords
 * @return {boolean} true if legal, false otherwise
 */
function legalCenter(tboard, move) {
	return tboard[move[0] - move[0] % 3 + 1][move[1] - move[1] % 3 + 1] < 3;
}

/**
 * Changes the turn, checks if game is over, and gets the next Monte Carlo tree-search root.
 * @param {boolean} turn true if x, false otherwise
 * @param {move}    move array containing move x and y coords
 */
function setTurn(turn, move) {
	var color = xTurnGlobal ? 5:6;
	if (gameOver(board, color, move))
		over = color;
	else if (totalEmptyGlobal === 0)
		over = 'tie';

	xTurnGlobal = turn;
	prevMove = move;

	globalRoot = MCTSGetNextRoot(move);
	if (globalRoot)
		globalRoot.parent = null;
	else globalRoot = createMCTSRoot();

	numChoose1 = numChoose2 = numChoose3 = stopChoose = false;

//	 var mtc = mostTriedChild(globalRoot, null);

//	 if (!over && (turn === aiTurn || aiTurn === "both") && mtc && mtc.lastMove)
//		 drawHover(mtc.lastMove[0]);
//	 else drawBoard();
	drawBoard();

	if (over) {
		setTimeout(function () {
			var str = '';
			switch (parseOver(over)) {
				case 0:
					str = 'Game tied!';
					break;
				case 1:
					str = 'X wins!';
					break;
				case 2:
					str = 'O wins!';
					break;
			}
			if (tie)
				if (anti)
					str += ' (anti + tie tic tac toe)';
				else str += ' (tie tic tac toe)';
			else if (anti)
				str += ' (anti tic tac toe)';
			alert(str);
		}, 100);
		stopPonder();
	}

	saveBoard();

	if (!over && aiTurn !== 'null' && (turn === (aiTurn === 'first') || aiTurn === "both"))
		setTimeout(playAIMove, 25);
}

/**
 * Called when mouse pressed, handles playing a move and then changing the turn
 */
boardui.addEventListener('mousedown', function (e) {
	if (e.which === 3)
		return;
	if (aiTurn !== 'null' && xTurnGlobal === (aiTurn === 'first') || aiTurn === "both")
		return;
	if (over) {
		alert("The game is already over!");
		return;
	}
	var move = getMove(e.pageX, e.pageY - wrapperTop);
	if (!legalMove(board, move, prevMove, true))
		return;

	hoveredMove = false;
	playMoveGlobal(board, move, xTurnGlobal);
	e.preventDefault();
});

/**
 * Plays a move in the given board, move, and current player turn. Checks for local wins and for full squares.
 * @param  {board}   tboard the current board
 * @param  {move}    move   array containing move x and y coords
 * @param  {boolean} xturn  current player turn
 * @return {boolean} true if board is done (local win or square full), false otherwise
 */
function playMove(tboard, move, xturn) {
	var color = xturn ? 1:2;
	var centerx = move[0] - move[0] % 3 + 1, centery = move[1] - move[1] % 3 + 1;
	var startx = move[0] - move[0] % 3, starty = move[1] - move[1] % 3;
	tboard[move[0]][move[1]] = color;
	if (localWin(tboard, color, move, startx, starty))
		tboard[centerx][centery] = color + 4;
	else if (squareFull(tboard, startx, starty))
		tboard[centerx][centery] += 2;
	else return false;
	return true;
}

/**
 * Plays a move in the given board, move, and current player turn. Checks for local wins and for full squares. Check for local wins and full squares aided by emptyLeft.
 * @param  {board}   tboard    the current board
 * @param  {move}    move      array containing move x and y coords
 * @param  {boolean} xturn     current player turn
 * @param  {number}  emptyLeft the number of empty spots in the board square
 * @return {number} 1 if local win, 2 if square full, 0 otherwise
 */
function playMoveEmptyLeft(tboard, move, xturn, emptyLeft) {
	var color = xturn ? 1:2;
	var centerx = move[0] - move[0] % 3 + 1, centery = move[1] - move[1] % 3 + 1;
	var startx = move[0] - move[0] % 3, starty = move[1] - move[1] % 3;
	tboard[move[0]][move[1]] = color;
	if (emptyLeft < 8 && localWin(tboard, color, move, startx, starty)) {
		tboard[centerx][centery] = color + 4;
		return 1;
	}
	else if (emptyLeft === 1) {
		tboard[centerx][centery] += 2;
		return 2;
	}
	return 0;
}

function playMoveGlobal(tboard, move, xturn) {
	var emptyLeft = emptySpotsGlobal[(move[0] - move[0] % 3) / 3][(move[1] - move[1] % 3) / 3];
	var playMoveResult = playMoveEmptyLeft(tboard, move, xturn, emptyLeft);

	if (playMoveResult === 0) {
		totalEmptyGlobal--;
		emptySpotsGlobal[(move[0] - move[0] % 3) / 3][(move[1] - move[1] % 3) / 3]--;
	} else {
		totalEmptyGlobal -= emptyLeft;
		emptySpotsGlobal[(move[0] - move[0] % 3) / 3][(move[1] - move[1] % 3) / 3] = 0;
	}

	setTurn(!xturn, move);
}

/**
 * Checks for a local board win (normal tic tac toe win calculation)
 * @param  {board}  tboard the current board
 * @param  {number} color  1 if x, 2 if o
 * @param  {move}   move   array containing move x and y coords
 * @param  {number} startx left-most index of square
 * @param  {number} starty top-most index of square
 * @return {boolean} true if square won, false otherwise
 */
function localWin(tboard, color, move, startx, starty) {
	var i, a;
	var gg = true;

	for (i = startx; i < startx + 3; i++)
		if (tboard[i][move[1]] !== color) {
			gg = false;
			break;
		}
	if (gg) return true;
	gg = true;

	for (a = starty; a < starty + 3; a++)
		if (tboard[move[0]][a] !== color) {
			gg = false;
			break;
		}
	if (gg) return true;

	if (move[0] % 3 === move[1] % 3) {
		gg = true;
		for (i = startx, a = starty; i < startx + 3; i++, a++)
			if (tboard[i][a] !== color) {
				gg = false;
				break;
			}
		if (gg) return true;
	}


	if (move[0] % 3 === 2 - move[1] % 3) {
		gg = true;
		for (i = startx, a = starty + 2; i < startx + 3; i++, a--)
			if (tboard[i][a] !== color) {
				gg = false;
				break;
			}
		if (gg) return true;
	}

	return false;
}

function squareFull(tboard, startx, starty) {
	for (var i = startx; i < startx + 3; i++)
		for (var a = starty; a < starty + 3; a++)
			if (tboard[i][a] === 0)
				return false;
	return true;
}

function gameOver(tboard, color, m) {
	var i, a;
	var move = [m[0] - m[0] % 3 + 1, m[1] - m[1] % 3 + 1];
	var gg = true;

	for (i = 1; i < 9; i += 3)
		if (tboard[i][move[1]] !== color) {
			gg = false;
			break;
		}

	if (gg)
		return true;
	gg = true;

	for (a = 1; a < 9; a += 3)
		if (tboard[move[0]][a] !== color) {
			gg = false;
			break;
		}

	if (gg)
		return true;
	gg = true;

	if ((move[0] - move[0] % 3) / 3 !== (move[1] - move[1] % 3) / 3)
		gg = false;
	else for (i = 1, a = 1; i < 9; i+=3, a+=3)
		if (tboard[i][a] !== color) {
			gg = false;
			break;
		}

	if (gg)
		return true;
	gg = true;

	if ((move[0] - move[0] % 3) / 3 !== 2 - (move[1] - move[1] % 3) / 3)
		return false;
	else for (i = 1, a = 7; i < 9; i+=3, a-=3)
		if (tboard[i][a] !== color)
			return false;
	return true;
}

function tieGame(tboard, m) {
	for (var i = 1; i < 9; i+=3)
		for (var a = 1; a < 9; a+=3)
			if (tboard[i][a] < 3)
				return false;
	return true;
}

boardui.addEventListener('mousemove', function (e) {
	if (aiTurn !== 'null' && xTurnGlobal === (aiTurn === 'first') || aiTurn === "both" || over)		return;
	var move = getMove(e.pageX, e.pageY - wrapperTop);
	if (legalMove(board, move, prevMove, false)) {
		hoveredMove = move;
		drawHover(move);
	} else hoveredMove = false;
});

function updateAnalysis() {
	var range = getMCTSDepthRange();
	analElem.innerHTML = "Analysis: Depth-" + range[1] + " Result-" +
		range[2] + " Certainty-" + (globalRoot && globalRoot.totalTries > 0 ?
		(resultCertainty(globalRoot) * 100).toFixed(0):"0") + "%";
	numTrialsElem.innerHTML = "Trials: " + numberWithCommas(globalRoot.totalTries);
}

function resultCertainty(root) {
	if (root.totalTries > (root.hits + root.misses) * 3)
		return 1 - (root.hits + root.misses) / root.totalTries;
	else if (root.hits > root.misses)
		return (root.hits - root.misses) / root.totalTries;
	else if (root.hits < root.misses)
		return (root.misses - root.hits) / root.totalTries;
	else return 1 - (root.hits + root.misses) / root.totalTries;
}

var numPonders = 0;
function startPonder() {
	pondering = setInterval(function() {
		if (!globalRoot)
			globalRoot = createMCTSRoot();
		var startTime = new Date().getTime();
		var tempCount = 0;
		while ((new Date().getTime() - startTime) < 30 && !stopChoose) {
			globalRoot.chooseChild(simpleBoardCopy(board), simpleSpotsCopy(emptySpotsGlobal), totalEmptyGlobal);
			tempCount++;
		}
		if (numChoose3 && (tempCount < numChoose3 / 10 || tempCount < numChoose2 / 10 || tempCount < numChoose1 / 10))
			stopChoose = true;
		else {
			numChoose3 = numChoose2;
			numChoose2 = numChoose1;
			numChoose1 = tempCount;
		}
		numPonders++;
		if (numPonders % 10 === 0 && drawWeights)
			if (hoveredMove)
				drawHover(hoveredMove);
			else drawBoard();
		updateAnalysis();
	}, 1);
}

function stopPonder() {
	clearInterval(pondering);
}

function newCookieId() {
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	var cId;

	do {
		cId = "";
		for( var i=0; i < 5; i++)
				cId += possible.charAt(Math.floor(Math.random() * possible.length));
	} while (getCookie(cId));

	return cId;
}

function getMCTSDepthRange() {
	var root, range = new Array(3);
	for (range[0] = -1, root = globalRoot; root && root.children; range[0]++, root = leastTriedChild(root));
	for (range[1] = -1, root = globalRoot; root && root.children; range[1]++, root = mostTriedChild(root));
	root = globalRoot;
	if (root.totalTries > (root.hits + root.misses) * 3)
		range[2] = "Tie";
	else if ((root.hits > root.misses) === xTurnGlobal)
		range[2] = "X";
	else if ((root.hits < root.misses) === xTurnGlobal)
		range[2] = "O";
	else range[2] = "Tie";
	return range;
}

function MCTSGetChildren(father, tboard) {
	if (father.result !== 10)
		return [];

	var turn = father.turn;
	var children = [];
	var i, a;

	if (father.lastMove) {
		var nextCenter = [father.lastMove[0] % 3 * 3 + 1, father.lastMove[1] % 3 * 3 + 1];
		if (tboard[nextCenter[0]][nextCenter[1]] < 3) {
			for (i = nextCenter[0] - 1; i <= nextCenter[0] + 1; i++)
				for (a = nextCenter[1] - 1; a <= nextCenter[1] + 1; a++)
					if (tboard[i][a] === 0)
						children.push(new MCTSNode(father, !turn, [i, a]));
			return children;
		}
	} else {
		for (i = 0; i < 9; i++)
			for (a = 0; a < 9; a++)
				children.push(new MCTSNode(father, !turn, [i, a]));
		return children;
	}

	for (var I = 1; I < 9; I+=3)
		for (var A = 1; A < 9; A+=3)
			if (tboard[I][A] < 3)
				for (i = I-1; i <= I+1; i++)
					for (a = A-1; a <= A+1; a++)
						if (tboard[i][a] === 0)
							children.push(new MCTSNode(father, !turn, [i, a]));
	return children; // if ransom is paid
}

function getEmptySpots(tboard) {
	var emptySpots = new Array(3);
	var count, I, A, i, a;
	for (i = 0; i < emptySpots.length; i++)
		emptySpots[i] = new Array(3);

	for (I = 1; I < 9; I += 3)
		for (A = 1; A < 9; A += 3) {
			count = 0;
			if (tboard[I][A] < 3)
				for (i = I - 1; i <= I + 1; i++)
					for (a = A - 1; a <= A + 1; a++)
						if (tboard[i][a] === 0)
							count++;
			emptySpots[(I - 1) / 3][(A - 1) / 3] = count;
		}
	return emptySpots;
}

function MCTSSimulate(father, tboard, emptySpots, totalEmpty, playMoveResult) {
	if (father.result !== 10)
		return father.result;


	if (playMoveResult === 1 && totalEmpty <= 54 && gameOver(tboard, father.turn ? 6:5, father.lastMove))
		if (tie)
			return father.result = father.turn !== anti ? -1:0;
		else return father.result = anti ? 1:-1;

	if (totalEmpty === 0)
		return father.result = tie ? (father.turn !== anti ? 1:-1):0;

	var lm = father.lastMove, turn = father.turn, done = false;
	var nextCenter;
	var x, y, count, i, a, I, A;
	var currentEmpty, emptyLeft;

	while (!done) {
		nextCenter = [lm[0] % 3 * 3 + 1, lm[1] % 3 * 3 + 1];
		currentEmpty = emptySpots[(nextCenter[0] - nextCenter[0] % 3) / 3][(nextCenter[1] - nextCenter[1] % 3) / 3];
		if (currentEmpty !== 0) {
			count = Math.floor(Math.random() * currentEmpty);
			outer:
			for (x = nextCenter[0] - 1; x <= nextCenter[0] + 1; x++)
				for (y = nextCenter[1] - 1; y <= nextCenter[1] + 1; y++)
					if (tboard[x][y] === 0)
						if (count === 0)
							break outer;
						else count--;
		} else {
			count = Math.floor(Math.random() * totalEmpty);
			outer1:
			for (nextCenter[0] = 1; nextCenter[0] < 9; nextCenter[0] += 3)
				for (nextCenter[1] = 1; nextCenter[1] < 9; nextCenter[1] += 3) {
					if (tboard[nextCenter[0]][nextCenter[1]] < 3)
						for (x = nextCenter[0]-1; x <= nextCenter[0]+1; x++)
							for (y = nextCenter[1]-1; y <= nextCenter[1]+1; y++)
								if (tboard[x][y] === 0)
									if (count === 0)
										break outer1;
									else count--;
				}
		}
		emptyLeft = emptySpots[(x - x % 3) / 3][(y - y % 3) / 3];
		playMoveResult = playMoveEmptyLeft(tboard, [x, y], turn, emptyLeft);
		if (playMoveResult === 0) {
			totalEmpty--;
			emptySpots[(x - x % 3) / 3][(y - y % 3) / 3]--;
		} else {
			totalEmpty -= emptyLeft;
			emptySpots[(x - x % 3) / 3][(y - y % 3) / 3] = 0;
			if (playMoveResult === 1 && totalEmpty <= 54)
				done = gameOver(tboard, turn ? 5:6, [x, y]);
				// 9 * 9 - 9 * 3 (three squares completed)
			if (totalEmpty === 0) // tie game
				return tie ? (father.turn !== anti ? 1:-1):0;
		}
		lm = [x, y];
		turn = !turn;
	}
	if (tie)
		return father.turn !== anti ? (turn ? 0:-1):(turn ? 0:1);
	if ((turn === father.turn) !== anti)
		return -1;
	return 1;
}

function syntaxSpeed(numTrials) {
	let startTime = new Date().getTime();
	for (var i = 0; i < 5e8; i++) {}
	console.log((new Date().getTime() - startTime) / 1E3);

	var num;

	var values = [[0, 3], [0, 4], [0, 5], [0, 6], [1, 6], [2, 6], [3, 6]];
	startTime = new Date().getTime();
	for (var i = 0; i < numTrials; i++) {
		values = [[0, 3], [0, 4], [0, 5], [0, 6], [1, 6], [2, 6], [3, 6]];
	}
	let minTime = (new Date().getTime() - startTime) / 1E3;

	var temp;

	console.log("Done preparing");

	startTime = new Date().getTime();
	for (var i = 0; i < numTrials; i++) {
		values = [[0, 3], [0, 4], [0, 5], [0, 6], [1, 6], [2, 6], [3, 6]];
		temp = values.sort(function() {
			return Math.random() - .5
		});
	}
	console.log((new Date().getTime() - startTime) / 1E3 - minTime);

	startTime = new Date().getTime();
	for (var i = 0; i < numTrials; i++) {
		values = [[0, 3], [0, 4], [0, 5], [0, 6], [1, 6], [2, 6], [3, 6]];
		temp = []
		while (values.length) {

		   var randomIndex = Math.floor(Math.random() * values.length),
		       element = values.splice(randomIndex, 1)

		   temp.push(element[0]);

		}
	}
	console.log((new Date().getTime() - startTime) / 1E3 - minTime);
}

function createMCTSRoot() {
	return new MCTSNode(null, xTurnGlobal, prevMove);
}

function runMCTS(time) {
	if (!globalRoot)
		globalRoot = createMCTSRoot();
	var startTime = new Date().getTime();
	while ((new Date().getTime() - startTime) / 1E3 < time) {
		for (var i = 0; i < 2000; i++)
			globalRoot.chooseChild(simpleBoardCopy(board), simpleSpotsCopy(emptySpotsGlobal), totalEmptyGlobal);
		var error = getCertainty(globalRoot);
		var certainty = resultCertainty(globalRoot)
		if (globalRoot.children.length < 2 || error < certaintyThreshold || certainty > 0.9)
			return;
	}
	while (globalRoot.totalTries < 81)
		globalRoot.chooseChild(simpleBoardCopy(board), simpleSpotsCopy(emptySpotsGlobal), totalEmptyGlobal);
	console.log("Total Simulations: " + globalRoot.totalTries);
}

function getCertainty(root) {
	var bestChild = mostTriedChild(root, null);
	var ratio = mostTriedChild(root, bestChild).totalTries / bestChild.totalTries;
	var ratioWins = bestChild.hits < bestChild.misses ? (bestChild.hits / bestChild.misses * 2):(bestChild.misses / bestChild.hits * 3);
	return ratio > ratioWins ? ratioWins:ratio;
}

function playAIMove() {
	runMCTS(timeToThink);
	fpaim();
}

function fpaim() {
	var bestMove = getBestMoveMCTS();
	playMoveGlobal(board, bestMove, xTurnGlobal);
}

function getBestMoveMCTS() {
	var bestChild = mostTriedChild(globalRoot, null);
	if (!bestChild)
		return -1;
	return bestChild.lastMove;
}

function mostTriedChild(root, exclude) {
	var mostTrials = 0, child = null;
	if (!root.children)
		return null;
	if (root.children.length === 1)
		return root.children[0];
	for (var i = 0; i < root.children.length; i++)
		if (root.children[i] !== exclude && root.children[i].totalTries > mostTrials) {
			mostTrials = root.children[i].totalTries;
			child = root.children[i];
		}
	return child;
}

function bestRatioChild(root) {
	if (!root.children)
		return null;
	var child = root.children[0], bestRatio = child.misses / child.hits;
	if (root.children.length === 1)
		return child;
	for (var i = 1; i < root.children.length; i++)
		if (root.children[i].misses / root.children[i].hits > bestRatio) {
			bestRatio = root.children[i].misses / root.children[i].hits;
			child = root.children[i];
		}
	return child;
}

function leastTriedChild(root) {
	var leastTrials = root.totalTries + 1, child = null;
	if (!root.children)
		return null;
	for (var i = 0; i < root.children.length; i++)
		if (root.children[i].totalTries < leastTrials) {
			leastTrials = root.children[i].totalTries;
			child = root.children[i];
		}
	return child;
}

function MCTSGetNextRoot(move) {
	if (!globalRoot || !globalRoot.children)
		return null;
	for (var i = 0; i < globalRoot.children.length; i++)
		if (globalRoot.children[i].lastMove[0] === move[0] && globalRoot.children[i].lastMove[1] === move[1]) {
			return globalRoot.children[i];
		}
	return null;
}

class MCTSNode {
	constructor(parent, turn, lastMove) {
		this.parent = parent;
		this.turn = turn;
		this.lastMove = lastMove;
		this.hits = 0;
		this.misses = 0;
		this.totalTries = 0;
		this.hasChildren = false;
		this.children = [];
		this.result = 10; // never gonna happen
		this.countUnexplored = 0;
	}

	chooseChild(board, emptySpots, totalEmpty) {
		if (this.hasChildren === false) {
			this.hasChildren = true;
			this.children = MCTSGetChildren(this, board);
			this.countUnexplored = this.children.length;
		}
		if (this.result !== 10) // leaf node
			this.backPropogate(this.result);
		else {
			var i, lastMove, emptyLeft, playMoveResult;
			var unexplored = this.countUnexplored;

			if (unexplored > 0) {
				this.countUnexplored--;
				var ran = Math.floor(Math.random() * unexplored);
				for (i = 0; i < this.children.length; i++)
					if (this.children[i].totalTries === 0) {
						if (ran === 0) {
							lastMove = this.children[i].lastMove;
							emptyLeft = emptySpots[(lastMove[0] - lastMove[0] % 3) / 3][(lastMove[1] - lastMove[1] % 3) / 3];
							playMoveResult = playMoveEmptyLeft(board, lastMove, !this.children[i].turn, emptyLeft);

							if (playMoveResult === 0) {
								totalEmpty--;
								emptySpots[(lastMove[0] - lastMove[0] % 3) / 3][(lastMove[1] - lastMove[1] % 3) / 3]--;
							} else {
								totalEmpty -= emptyLeft;
								emptySpots[(lastMove[0] - lastMove[0] % 3) / 3][(lastMove[1] - lastMove[1] % 3) / 3] = 0;
							}

							this.children[i].backPropogate(MCTSSimulate(this.children[i], board, emptySpots, totalEmpty, playMoveResult));
							return;
						}
						ran--;
					}
			} else {
				var bestChild = this.children[0], bestPotential = MCTSChildPotential(this.children[0], this.totalTries), potential;
				for (i = 1; i < this.children.length; i++) {
					potential = MCTSChildPotential(this.children[i], this.totalTries);
					if (potential > bestPotential) {
						bestPotential = potential;
						bestChild = this.children[i];
					}
				}
				lastMove = bestChild.lastMove;
				emptyLeft = emptySpots[(lastMove[0] - lastMove[0] % 3) / 3][(lastMove[1] - lastMove[1] % 3) / 3];
				playMoveResult = playMoveEmptyLeft(board, lastMove, !bestChild.turn, emptyLeft);

				if (playMoveResult === 0) {
					totalEmpty--;
					emptySpots[(lastMove[0] - lastMove[0] % 3) / 3][(lastMove[1] - lastMove[1] % 3) / 3]--;
				} else {
					totalEmpty -= emptyLeft;
					emptySpots[(lastMove[0] - lastMove[0] % 3) / 3][(lastMove[1] - lastMove[1] % 3) / 3] = 0;
				}

				bestChild.chooseChild(board, emptySpots, totalEmpty);
			}
		}
	}

	backPropogate(simulation) {
		if (simulation === 1)
			this.hits++;
		else if (simulation === -1)
			this.misses++;
		this.totalTries++;
		if (this.parent !== null)
			this.parent.backPropogate(-simulation);
	}
}

function MCTSChildPotential(child, t) {
	var w = child.misses - child.hits;
	var n = child.totalTries;
	var c = expansionConstant;

	return w / n	+	c * Math.sqrt(Math.log(t) / n);
}

function speedTest(numSimulations) {
	globalRoot = createMCTSRoot();
	var startTime = new Date().getTime();
	for (var i = 0; i < numSimulations; i++)
		globalRoot.chooseChild(simpleBoardCopy(board), simpleSpotsCopy(emptySpotsGlobal), totalEmptyGlobal);
	var elapsedTime = (new Date().getTime() - startTime) / 1E3;
	console.log(numberWithCommas(Math.round(numSimulations / elapsedTime)) + ' simulations per second.');
}

function simpleBoardCopy(board) {
	var simpleCopy = new Array(9);
	for (var i = 0; i < 9; i++) {
		simpleCopy[i] = new Array(9);
		for (var a = 0; a < 9; a++)
			simpleCopy[i][a] = board[i][a];
	}
	return simpleCopy;
}

function simpleSpotsCopy(spots) {
	var simpleCopy = new Array(3);
	for (var i = 0; i < 3; i++) {
		simpleCopy[i] = new Array(3);
		for (var a = 0; a < 3; a++)
			simpleCopy[i][a] = spots[i][a];
	}
	return simpleCopy;
}

function efficiencyTest() {
	speedTest();
	setInterval(function() {
		for (var i = 0; i < 1000; i++)
			globalRoot.chooseChild(simpleBoardCopy(board), simpleSpotsCopy(emptySpotsGlobal), totalEmptyGlobal);
		numTrialsElem.innerHTML = globalRoot.totalTries;
	}, 1);
}

function parseOver(over) {
	switch (over) {
		case 'tie':
			if (tie)
				return anti ? 2:1;
			return 0;
		case 5:
			if (anti)
				return tie ? 1:2;
			return tie ? 0:1;
		case 6:
			if (anti)
				return tie ? 0:1;
			return 2;
	}
}

function testStats(timeToThink, numTrials) {
	var winsFirst = winsSecond = ties = 0;
	var startTest = new Date().getTime();
	for (var I = 0; I < numTrials; I++) {
		// Create the new game
		over = false;
		prevMove = false;
		board = new Array(9);
		for (var i = 0; i < board.length; i++) {
			board[i] = new Array(9);
			for (var a = 0; a < board[i].length; a++)
				board[i][a] = 0;
		}
		var root = createMCTSRoot();
		while (!over) {
			var startTime = new Date().getTime();
			if (!root)
				root = createMCTSRoot();
			while ((new Date().getTime() - startTime) / 1E3 < timeToThink) {
				for (var i = 0; i < 100; i++)
					root.chooseChild(simpleBoardCopy(board));
				var error = getCertainty(root);
				if (root.children.length < 2 || error < certaintyThreshold)
					break;
			}
			var bestChild = mostTriedChild(root, null);
			var bestMove = bestChild.lastMove;
			playMove(board, bestMove, xTurnGlobal);

			var color = xTurnGlobal ? 5:6;
			if (gameOver(board, color, bestMove))
				over = color;
			else if (tieGame(board))
				over = 'tie';

			xTurnGlobal = !xTurnGlobal;
			prevMove = bestMove;

			if (root.children) {
				for (var i = 0; i < root.children.length; i++)
					if (root.children[i].lastMove[0] === bestMove[0] && root.children[i].lastMove[1] === bestMove[1]) {
						root = root.children[i];
						break;
					}
				root.parent = null;
			} else root = createMCTSRoot();
		}
		switch (parseOver(over)) {
			case 0:
				ties++;
				break;
			case 1:
				winsFirst++;
				break;
			case 2:
				winsSecond++;
				break;
		}
	}
	var elapsedTestTime = (new Date().getTime() - startTest) / 1E3;
	console.log("First:\t" + winsFirst);
	console.log("Second:\t" + winsSecond);
	console.log("Ties:\t" + ties);
	console.log("In:\t\t" + elapsedTestTime.toFixed(2) + ' seconds');
}

function initWorkers(callback) {
	var numWorkers = navigator.hardwareConcurrency || 4;
	workers = new Array(numWorkers);
	workersCallbackCount = 0;
	for (var i = 0; i < workers.length; i++) {
		workers[i] = new Worker("/static/assets/javascript/games/UTTTWorker.js");
		workers[i].postMessage({
			'cmd': 'init',
			'root': createMCTSRoot(),
			'board': board,
			'workerIndex': i,
			'workersCount': workers.length,
			'tie': tie,
			'anti': anti
		});
	}

}

function evaluateOver(lastMove) {
	var color = xTurnGlobal ? 5:6;
	if (gameOver(board, color, lastMove))
		over = color;
	else if (tieGame(board))
		over = 'tie';
}

function combineRoots(gR, root, board) {
	if (!gR || !root)
		return;
	gR.hits += root.hits;
	gR.misses += root.misses;
	gR.totalTries += root.totalTries;
	if (root.children && root.children.length > 0) {
		if (!gR.children || gR.children.length !== root.children.length)
			gR.children = MCTSGetChildren(gR, board);
		for (var i = 0; i < root.children.length; i++) {
			var b = simpleBoardCopy(board);
			playMove(b, gR.children[i].lastMove, !gR.children[i].turn);
			combineRoots(gR.children[i], root.children[i], b);
		}
	}
}

function playTestMove(bestChild) {
	var bestMove = bestChild.lastMove;
	playMove(board, bestMove, xTurnGlobal);
	evaluateOver(bestMove);

	xTurnGlobal = !xTurnGlobal;
	prevMove = bestMove;

	globalRoot = MCTSGetNextRoot(bestMove);
	if (!globalRoot)
		globalRoot = createMCTSRoot();
	// console.log(bestMove);
	// printBoard(board);
}

function playNormalMove(timeToThink, callback) {
	var startTime = new Date().getTime();
	while ((new Date().getTime() - startTime) / 1E3 < timeToThink + 0.1)
		for (var i = 0; i < 100; i++)
			globalRoot.chooseChild(simpleBoardCopy(board));
	// console.log("Normal\t- " + globalRoot.totalTries);
	playTestMove(mostTriedChild(globalRoot, null));
	callback();
}

function playNormalMoveRatio(timeToThink, callback) {
	var startTime = new Date().getTime();
	while ((new Date().getTime() - startTime) / 1E3 < timeToThink + 0.1)
		for (var i = 0; i < 100; i++)
			globalRoot.chooseChild(simpleBoardCopy(board));
	// console.log("Normal\t- " + globalRoot.totalTries);
	playTestMove(bestRatioChild(globalRoot, null));
	callback();
}

var workersCount;

function playMultithreadingMove(timeToThink, callback) {
	workersCount = workers.length;
	for (var i = 0; i < workers.length; i++) {
		workers[i].postMessage({
			'cmd': 'runTimeSplit',
			'root': createMCTSRoot(),
			'board': board,
			'workerIndex': i,
			'workersCount': workers.length,
			'timeToThink': timeToThink,
		});
		workers[i].onmessage = function (e) {
			var data = e.data;
			combineRoots(globalRoot, data.root, board);
			workersCount--;
			if (workersCount === 0) {
				// console.log("Multi\t- " + globalRoot.totalTries);
				playTestMove(bestRatioChild(globalRoot, null));
				callback();
			}
		}
	}
}

function testMultithreading(numTrials, timeToThink, init, v1, v2) {
	// if (!workers)
	// 	initWorkers();
	if (numTrials === 0) {
		console.log(v1 > v2 ? 'Multi-threading is better!':'Multi-threading is worse :/');
		return;
	} 	else if (init || init === undefined) {
		over = false;
		prevMove = false;
		board = new Array(9);
		for (var i = 0; i < board.length; i++) {
			board[i] = new Array(9);
			for (var a = 0; a < board[i].length; a++)
				board[i][a] = 0;
		}

		xTurnGlobal = true;
		globalRoot = createMCTSRoot();
		init = false;
	} 	else if (over) {
		if (v1 === undefined)
			v1 = v2 = 0;
		switch (parseOver(over)) {
			case 1:
				if (numTrials % 2 === 0)
					v1++;
				else v2++;
				break;
			case 2:
				if (numTrials % 2 === 0)
					v2++;
				else v1++;
				break;
		}
		console.log("Multi-threading: " + v1 + '-' + v2);
		init = true;
		numTrials--;
	}	else {
		var cb = function() {
			testMultithreading(numTrials, timeToThink, init, v1, v2);
		};
		if (xTurnGlobal === (numTrials % 2 === 0))
			playNormalMoveRatio(timeToThink, cb);
			// playMultithreadingMove(timeToThink, cb);
		else playNormalMove(timeToThink, cb);
		return;
	}
	testMultithreading(numTrials, timeToThink, init, v1, v2);
}

var t1;
function testExpansionConstants(c1, c2, numTrials, timeToThink, output) {
	var v1 = v2 = 0;
	t1 = [c1, c2];
	for (var I = 0; I < numTrials; I++) {
		over = false;
		prevMove = false;
		board = new Array(9);
		for (var i = 0; i < board.length; i++) {
			board[i] = new Array(9);
			for (var a = 0; a < board[i].length; a++)
				board[i][a] = 0;
		}

		xTurnGlobal = true;
		var r1 = createMCTSRoot(), r2 = createMCTSRoot();

		while (!over) {
			var startTime = new Date().getTime();
			var r = (I % 2 === 0) === xTurnGlobal ? r1:r2;
			expansionConstant = (I % 2 === 0) === xTurnGlobal ? c1:c2;
			if (!r)
				r = createMCTSRoot();
			while ((new Date().getTime() - startTime) / 1E3 < timeToThink) {
				for (var i = 0; i < 100; i++)
					r.chooseChild(simpleBoardCopy(board));
				var error = getCertainty(r);
				if (r.children.length < 2 || error < certaintyThreshold)
					break;
			}
			var bestChild = mostTriedChild(r, null);
			var bestMove = bestChild.lastMove;
			playMove(board, bestMove, xTurnGlobal);

			var color = xTurnGlobal ? 5:6;
			if (gameOver(board, color, bestMove))
				over = color;
			else if (tieGame(board))
				over = 'tie';

			xTurnGlobal = !xTurnGlobal;
			prevMove = bestMove;

			if (r1.children) {
				for (var i = 0; i < r1.children.length; i++)
					if (r1.children[i].lastMove[0] === bestMove[0] && r1.children[i].lastMove[1] === bestMove[1]) {
						r1 = r1.children[i];
						break;
					}
				r1.parent = null;
			} else r1 = createMCTSRoot();
			if (r2.children) {
				for (var i = 0; i < r2.children.length; i++)
					if (r2.children[i].lastMove[0] === bestMove[0] && r2.children[i].lastMove[1] === bestMove[1]) {
						r2 = r2.children[i];
						break;
					}
				r2.parent = null;
			} else r2 = createMCTSRoot();
			// console.log("next turn ", board);
		}
		switch (parseOver(over)) {
			case 0:
				if (output)
					console.log("tie");
				break;
			case 1:
				if ((I % 2 === 0)) {
					v1++;
					if (output)
						console.log("c1 wins");
				} else {
					v2++;
					if (output)
						console.log("c2 wins");
				}
				break;
			case 2:
				if ((I % 2 === 0)) {
					v2++;
					if (output)
						console.log("c2 wins");
				} else {
					v1++;
					if (output)
						console.log("c1 wins");
				}
				break;
		}
	}
	console.log(c1 + ": " + v1 + " and " + c2 + ": " + v2);
	return [v1, v2];
}

function findBestExpansionConstant(seed, timeToThink, bound, numSimulations, prollyGreater) {
	console.log("!!!");
	console.log("Best constant: ", seed);
	console.log("Bound: ", bound);
	console.log("!!!");

	if (seed < 0)
		return;

	var delta1, delta2;

	var round1 = testExpansionConstants(seed, prollyGreater ? (seed + bound):(seed - bound), numSimulations, timeToThink, false);
	if (round1[1] > round1[0])
		findBestExpansionConstant(prollyGreater ? (seed + bound):(seed - bound), timeToThink, bound / 2, numSimulations, true);
	else {
		delta1 = round1[0] - round1[1];
		var round2 = testExpansionConstants(seed, prollyGreater ? (seed - bound):(seed + bound), numSimulations, timeToThink, false);
		if (round2[1] > round2[0])
			findBestExpansionConstant(prollyGreater ? (seed - bound):(seed + bound), timeToThink, bound / 2, numSimulations, true);
		else {
			delta2 = round2[0] - round2[1];
			findBestExpansionConstant(seed, timeToThink, bound / 2, numSimulations, delta1 < delta2 === prollyGreater);
		}
	}
}

document.addEventListener('keypress', function (event) {
	switch (event.which) {
		case 115: case 83: // s
			showSettingsForm();
			break;
		case 110: case 78: // n
			newGame();
			break;
		case 117: case 85: // u
			undo();
			break;
		case 114: case 82: // r
			redo();
			break;

	}
});

function getNewSettings() {
	return {
		'ponder': getElemId('ponder').checked,
		'aiTurn': getElemId('ai-turn').value,
		'timeToThink': getElemId('time-to-think').value,
		'drawWeights': getElemId('draw-weights').checked,
		'anti': getElemId('anti-tic-tac-toe').checked,
		'tie': getElemId('tie-tic-tac-toe').checked,
	}
}

function populateSettingsForm(settings) {
	getElemId('ponder').checked = settings.ponder;
	getElemId('ai-turn').value = settings.aiTurn;
	getElemId('time-to-think').value = settings.timeToThink;
	getElemId('draw-weights').checked = settings.drawWeights;
	getElemId('anti-tic-tac-toe').checked = settings.anti;
	getElemId('tie-tic-tac-toe').checked = settings.tie;
}

function printBoard(board) {
	for (var i = 0; i < 9; i++) {
		var str = '';
		for (var a = 0; a < 9; a++)
			if (a % 3 === 2 && a !== 8)
				str += board[a][i] + '|';
			else str += board[a][i];
		console.log(str);
		if (i % 3 === 2 && i !== 8)
			console.log('-----------');
	}
}
