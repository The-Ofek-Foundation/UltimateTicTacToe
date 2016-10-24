var tie = anti = false;
var workersCount, workerIndex;
var globalRoot;

self.addEventListener('message', function(e) {
	let data = e.data;
	let gR = data.root, board, timeToThink, startTime;
	switch (data.cmd) {
		case 'init':
			tie = data.tie, anti = data.anti;
			workersCount = data.workersCount, workerIndex = data.workerIndex;
			globalRoot = new MCTSNode(false, gR.turn, gR.lastMove);
			break;
		case 'runTimeSplit':
			board = data.board, timeToThink = data.timeToThink;
			globalRoot = new MCTSNode(false, gR.turn, gR.lastMove);
			globalRoot.children = MCTSGetChildren(globalRoot, board);
			let startIndex = split(workerIndex, workersCount, globalRoot.children.length);
			let endIndex = split(workerIndex + 1, workersCount, globalRoot.children.length);
			startTime = new Date().getTime();
			let boards = new Array(endIndex - startIndex);
			for (let a = 0; a < boards.length; a++) {
				let b = simpleCopy(board);
				playMove(b, globalRoot.children[a + startIndex].lastMove, !globalRoot.children[a + startIndex].turn);
				boards[a] = b;
			}
			while ((new Date().getTime() - startTime) / 1E3 < timeToThink)
				for (let i = startIndex; i < endIndex; i++)
					globalRoot.children[i].chooseChild(simpleCopy(boards[i - startIndex]));
			stripChildren(globalRoot);
			self.postMessage({'root': globalRoot});
			break;
		case 'runTime':
			board = data.board, timeToThink = data.timeToThink;
			root = new MCTSNode(false, gR.turn, gR.lastMove);
			combineRoots(root, gR, board);
			startTime = new Date().getTime();
			while ((new Date().getTime() - startTime) / 1E3 < timeToThink)
				for (let i = 0; i < 100; i++)
					root.chooseChild(simpleCopy(board));
			stripChildren(root);
			self.postMessage({'root': root});
			break;
	}
});

function combineRoots(gR, root, board) {
	gR.hits += root.hits;
	gR.misses += root.misses;
	gR.totalTries += root.totalTries;
	if (root.children && root.children.length > 0) {
		if (!gR.children || gR.children.length === 0)
			gR.children = MCTSGetChildren(gR, board);
		for (let i = 0; i < root.children.length; i++) {
			let b = simpleCopy(board);
			playMove(b, gR.children[i].lastMove, !gR.children[i].turn);
			combineRoots(gR.children[i], root.children[i], b);
		}
	}
}

function stripChildren(root) {
	for (let i = 0; i < root.children.length; i++)
		if (root.children[i].children)
			for (let a = 0; a < root.children[i].children.length; a++)
				root.children[i].children[a].children = undefined;
}

function playMove(tboard, move, xturn) {
	let color = xturn ? 1:2;
	let centerx = move[0] - move[0] % 3 + 1, centery = move[1] - move[1] % 3 + 1;
	let startx = move[0] - move[0] % 3, starty = move[1] - move[1] % 3;
	tboard[move[0]][move[1]] = color;
	if (localWin(tboard, color, move, startx, starty))
		tboard[centerx][centery] = color + 4;
	else if (squareFull(tboard, startx, starty))
		tboard[centerx][centery] += 2;
}

function MCTSGetChildren(father, tboard) {
	var turn = father.turn;
	var children = [];
	var i, a;

	if (father.result !== undefined)
		return [];

	if (father.lastMove) {
		var nextCenter = [father.lastMove[0] % 3 * 3 + 1, father.lastMove[1] % 3 * 3 + 1];
		var nextCenterColor = tboard[nextCenter[0]][nextCenter[1]];
		if (nextCenterColor !== 5 && nextCenterColor !== 6 && nextCenterColor !== 3 && nextCenterColor !== 4) {
			for (i = nextCenter[0] - 1; i <= nextCenter[0] + 1; i++)
				for (a = nextCenter[1] - 1; a <= nextCenter[1] + 1; a++)
					if (tboard[i][a] === 0)
						children.push(new MCTSNode(father, !turn, [i, a]));
			return children;
		}
	}
	else {
		for (i = 0; i < 9; i++)
			for (a = 0; a < 9; a++)
				children.push(new MCTSNode(father, !turn, [i, a]));
		return children;
	}

	for (var I = 1; I < 9; I+=3)
		for (var A = 1; A < 9; A+=3)
			if (tboard[I][A] !== 5 && tboard[I][A] !== 6 && tboard[I][A] !== 3 && tboard[I][A] !== 4)
				for (i = I-1; i <= I+1; i++)
					for (a = A-1; a <= A+1; a++)
						if (tboard[i][a] === 0)
							children.push(new MCTSNode(father, !turn, [i, a]));
	return children;
}

function MCTSSimulate(father, tboard) {
	if (father.result !== undefined)
		return father.result;

	if (gameOver(tboard, father.turn ? 6:5, father.lastMove))
		if (tie)
			return father.result = father.turn !== anti ? -1:0;
		else return father.result = anti ? 1:-1;

	if (tieGame(tboard))
		return father.result = tie ? (father.turn !== anti ? 1:-1):0;

	var lm = father.lastMove, turn = father.turn, done = false;
	var nextCenter, nextCenterColor;
	var x, y, count;
	var swap = false;
	var tries;
	while (!done) {
		nextCenter = [lm[0] % 3 * 3 + 1, lm[1] % 3 * 3 + 1];
		nextCenterColor = tboard[nextCenter[0]][nextCenter[1]];
		count = 0;
		tries = 0;
		if (swap)
			if (nextCenterColor !== 5 && nextCenterColor !== 6 && nextCenterColor !== 3 && nextCenterColor !== 4) {
				for (x = nextCenter[0]-1; x <= nextCenter[0]+1; x++)
					for (y = nextCenter[1]-1; y <= nextCenter[1]+1; y++)
						if (tboard[x][y] === 0)
							count++;
				count = Math.random() * count | 0;
				outer:
				for (x = nextCenter[0]-1; x <= nextCenter[0]+1; x++)
					for (y = nextCenter[1]-1; y <= nextCenter[1]+1; y++)
						if (tboard[x][y] === 0)
							if (count === 0)
								break outer;
							else count--;
			}
			else {
				for (nextCenter[0] = 1; nextCenter[0] < 9; nextCenter[0] += 3)
					for (nextCenter[1] = 1; nextCenter[1] < 9; nextCenter[1] += 3) {
						nextCenterColor = tboard[nextCenter[0]][nextCenter[1]];
						if (nextCenterColor !== 5 && nextCenterColor !== 6 && nextCenterColor !== 3 && nextCenterColor !== 4)
							for (x = nextCenter[0]-1; x <= nextCenter[0]+1; x++)
								for (y = nextCenter[1]-1; y <= nextCenter[1]+1; y++)
									if (tboard[x][y] === 0)
										count++;
					}
				count = Math.random() * count | 0;
				outer1:
				for (nextCenter[0] = 1; nextCenter[0] < 9; nextCenter[0] += 3)
					for (nextCenter[1] = 1; nextCenter[1] < 9; nextCenter[1] += 3) {
						nextCenterColor = tboard[nextCenter[0]][nextCenter[1]];
						if (nextCenterColor !== 5 && nextCenterColor !== 6 && nextCenterColor !== 3 && nextCenterColor !== 4)
							for (x = nextCenter[0]-1; x <= nextCenter[0]+1; x++)
								for (y = nextCenter[1]-1; y <= nextCenter[1]+1; y++)
									if (tboard[x][y] === 0)
										if (count === 0)
											break outer1;
										else count--;
					}
			}
		else if (nextCenterColor !== 5 && nextCenterColor !== 6 && nextCenterColor !== 3 && nextCenterColor !== 4)
				do {
					x = nextCenter[0] - 1 + Math.random() * 3 | 0;
					y = nextCenter[1] - 1 + Math.random() * 3 | 0;
					tries++;
				}	while (tboard[x][y] !== 0);
			else do {
				x = Math.random() * 9 | 0;
				y = Math.random() * 9 | 0;
				tries++;
			}	while (!legalCenter(tboard, [x, y]) || tboard[x][y] !== 0);
		if (tries > 1)
			swap = true;
		playMove(tboard, [x, y], turn);
		done = gameOver(tboard, turn ? 5:6, [x, y]);
		if (tieGame(tboard))
			return tie ? (father.turn !== anti ? 1:-1):0;
		lm = [x, y];
		turn = !turn;
	}
	if (tie)
		return father.turn !== anti ? (turn ? 0:-1):(turn ? 0:1);
	if ((turn === father.turn) !== anti)
		return -1;
	return 1;
}

class MCTSNode {
	constructor(parent, turn, lastMove) {
		this.parent = parent;
		this.turn = turn;
		this.lastMove = lastMove;
		this.hits = 0;
		this.misses = 0;
		this.totalTries = 0;
	}

	chooseChild(board) {
		if (this.children === undefined)
			this.children = MCTSGetChildren(this, board);
		if (this.children.length === 0) // leaf node
			this.runSimulation(board);
		else {
			var i;
			var countUnexplored = 0;
			for (i = 0; i < this.children.length; i++)
				if (this.children[i].totalTries === 0)
					countUnexplored++;

			if (countUnexplored > 0) {
				var ran = Math.floor(Math.random() * countUnexplored);
				for (i = 0; i < this.children.length; i++)
					if (this.children[i].totalTries === 0) {
						countUnexplored--;
						if (countUnexplored === 0) {
							playMove(board, this.children[i].lastMove, !this.children[i].turn);
							this.children[i].runSimulation(board);
							return;
						}
					}

			}
			else {
				var bestChild = this.children[0], bestPotential = MCTSChildPotential(this.children[0], this.totalTries), potential;
				for (i = 1; i < this.children.length; i++) {
					potential = MCTSChildPotential(this.children[i], this.totalTries);
					if (potential > bestPotential) {
						bestPotential = potential;
						bestChild = this.children[i];
					}
				}
				playMove(board, bestChild.lastMove, !bestChild.turn);
				bestChild.chooseChild(board);
			}
		}
	}

	runSimulation(board) {
		this.backPropogate(MCTSSimulate(this, board));
	}

	backPropogate(simulation) {
		if (simulation > 0)
			this.hits++;
		else if (simulation < 0)
			this.misses++;
		this.totalTries++;
		if (this.parent)
			this.parent.backPropogate(-simulation);
	}
}

function localWin(tboard, color, move, startx, starty) {
	var i, a;

	for (var trial = 0; trial < 4; trial++) {
		cont:
		switch (trial) {
			case 0:
				for (i = startx; i < startx + 3; i++)
					if (tboard[i][move[1]] !== color)
						break cont;
				return true;
			case 1:
				for (a = starty; a < starty + 3; a++)
					if (tboard[move[0]][a] !== color)
						break cont;
				return true;
			case 2:
				if (move[0] % 3 !== move[1] % 3)
					break;
				for (i = startx, a = starty; i < startx + 3; i++, a++)
					if (tboard[i][a] !== color)
						break cont;
				return true;
			case 3:
				if (move[0] % 3 !== 2 - move[1] % 3)
					break;
				for (i = startx, a = starty + 2; i < startx + 3; i++, a--)
					if (tboard[i][a] !== color)
						break cont;
				return true;
		}
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

	for (var trial = 0; trial < 4; trial++) {
		cont:
		switch (trial) {
			case 0:
				for (i = 1; i < 9; i+=3)
					if (tboard[i][move[1]] !== color)
						break cont;
				return true;
			case 1:
				for (a = 1; a < 9; a+=3)
					if (tboard[move[0]][a] !== color)
						break cont;
				return true;
			case 2:
				if (Math.floor(move[0] / 3) !== Math.floor(move[1] / 3))
					break;
				for (i = 1, a = 1; i < 9; i+=3, a+=3)
					if (tboard[i][a] != color)
						break cont;
				return true;
			case 3:
				if (Math.floor(move[0] / 3) != 2 - Math.floor(move[1] / 3))
					break;
				for (i = 1, a = 7; i < 9; i+=3, a-=3)
					if (tboard[i][a] !== color)
						break cont;
				return true;
		}
	}
	return false;
}

function tieGame(tboard) {
	for (var i = 1; i < 9; i+=3)
		for (var a = 1; a < 9; a+=3)
			if (tboard[i][a] !== 3 && tboard[i][a] !== 4 && tboard[i][a] !== 6 && tboard[i][a] !== 5)
				return false;
	return true;
}

function legalCenter(tboard, move) {
	let c = tboard[move[0] - move[0] % 3 + 1][move[1] - move[1] % 3 + 1];
	return !(c === 5 || c === 6 || c === 4 || c === 3);
}

function MCTSChildPotential(child, t) {
	var w = child.misses - child.hits;
	var n = child.totalTries;

	return w / n	+	1.03125 * Math.sqrt(Math.log(t) / n);
}

function simpleCopy(board) {
	let simpleCopy = new Array(9);
	for (let i = 0; i < 9; i++) {
		simpleCopy[i] = new Array(9);
		for (let a = 0; a < 9; a++)
			simpleCopy[i][a] = board[i][a];
	}
	return simpleCopy;
}

function split(index, num, total) {
	if (index === num)
		return total;
	return (total / num | 0) * index;
}

function numberWithCommas(x) {
	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}