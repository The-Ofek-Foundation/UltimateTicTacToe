var docwidth, docheight;
var boardwidth, squarewidth;
var board;
var global_ROOT;
var expansion_const = 2.5;
var ai_turn = false;
var monte_carlo_trials = 10000;
var max_trials = 100000;
var over;
var prev_move;
var x_turn_global;
var ponder = false, pondering;
var time_to_think = 5;
var certainty_threshold = 0.1;

var boardui = document.getElementById("board");
var brush = boardui.getContext("2d");

$(document).ready(function() {
  docwidth = $(document).outerWidth(true);
  docheight = $(document).outerHeight(true);
  boardwidth = docwidth < docheight ? docwidth:docheight;
  
  $('#board').width(boardwidth).height(boardwidth);
  $('#board').css('left', (docwidth - boardwidth) / 2);
  boardui.setAttribute('width', boardwidth);
  boardui.setAttribute('height', boardwidth);
  
  $('#new-game-btn').css('top', (docheight - $('#new-game-btn').height()) / 2);
  $('#new-game-btn').css('left', (docwidth - $('#new-game-btn').outerWidth()) / 2);
  $('#new-game-menu').css('top', (docheight - $('#new-game-menu').outerHeight()) / 2);
  $('#new-game-menu').css('left', (docwidth - $('#new-game-menu').outerWidth()) / 2);
  
  new_game();
  
  ponder = prompt("Ponder?", "Yes").toLowerCase() == "yes" ? true:false;
  time_to_think = parseFloat(prompt("Time to think (seconds):", "5"));
  
  new_game();
});

function new_game() {
  squarewidth = boardwidth / 9;
  
  adjust_buttons();
  
  over = false;
  prev_move = false;
  board = new Array(9);
  for (var i = 0; i < board.length; i++) {
    board[i] = new Array(9);
    for (var a = 0; a < board[i].length; a++)
      board[i][a] = ' ';
  }
  
  x_turn_global = true;
      
  global_ROOT = create_MCTS_root();
  draw_board();
  
  if (ai_turn == x_turn_global || ai_turn == 'both')
    setTimeout(play_ai_move, 20);
  
  stop_ponder();
  if (ponder)
    start_ponder();
}

function clear_board() {
  brush.clearRect(0, 0, boardwidth, boardwidth);
}

function draw_grid() {
  if (prev_move && !over) {
    var next_center = [prev_move[0] % 3 * 3 + 1, prev_move[1] % 3 * 3 + 1];
    var next_center_color = board[next_center[0]][next_center[1]];
    if (next_center_color != 'X' && next_center_color != 'O' && next_center_color != '1' && next_center_color != '2') {
      brush.fillStyle = "rgba(255, 255, 0, 0.5)";
      brush.fillRect((next_center[0] / 3 | 0) * 3 * squarewidth, (next_center[1] / 3 | 0) * 3 * squarewidth, 3 * squarewidth, 3 * squarewidth);
    }
  }
  
  var i, a;
  brush.lineWidth = 5;
  brush.strokeStyle = "black";
  brush.beginPath();
  for (i = squarewidth * 3; i < boardwidth; i += squarewidth * 3) {
    brush.moveTo(i, 0);
    brush.lineTo(i, boardwidth);
  }
  for (a = squarewidth * 3; a < boardwidth; a += squarewidth * 3) {
    brush.moveTo(0, a);
    brush.lineTo(boardwidth, a);
  }
  brush.stroke();
  brush.closePath();
  
  brush.lineWidth = 1;
  brush.beginPath();
  for (i = squarewidth; i < boardwidth; i += squarewidth) {
    brush.moveTo(i, 0);
    brush.lineTo(i, boardwidth);
  }
  for (a = squarewidth; a < boardwidth; a += squarewidth) {
    brush.moveTo(0, a);
    brush.lineTo(boardwidth, a);
  }
  brush.stroke();
  brush.closePath();
}

function draw_piece(x, y) {
  var o4 = squarewidth / 4;
  var color = board[x][y];
  if (color == '1')
    color = 'x';
  else if (color == '2')
    color = 'o';
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
      brush.font = squarewidth + "px Arial";
      brush.fillText(color + "", x * squarewidth + squarewidth / 2, (y + 1) * squarewidth - o4);
      break;
    case 'X': case 'O':
      brush.font = (squarewidth * 3) + "px Arial";
      brush.fillText(color + "", Math.floor(x / 3) * squarewidth * 3 + squarewidth * 1.5, Math.floor(y / 3 + 1) * squarewidth * 3 - o4 * 1.5);
      break;
    default: return;
  }
  brush.fill();
}

function draw_board() {
  clear_board();
  draw_grid();
  update_analysis();
  
  for (var I = 1; I < 9; I+=3)
    for (var A = 1; A < 9; A+=3)
      if (board[I][A] == 'X' || board[I][A] == 'O')
        draw_piece(I, A);
      else for (var i = I-1; i <= I+1; i++)
        for (var a = A-1; a <= A+1; a++)
          if (board[i][a] != ' ')
            draw_piece(i, a);
}

function draw_hover(move) {
  board[move[0]][move[1]] = x_turn_global ? 'x':'o';
  draw_board();
  board[move[0]][move[1]] = ' ';
}

function get_move(xloc, yloc) {
  var left = (docwidth - boardwidth) / 2;
  if (xloc < left || xloc > left + boardwidth || yloc > boardwidth)
    return [-1, -1];
  return [(xloc - left) / squarewidth | 0, yloc / squarewidth | 0];
}

function legal_move(tboard, move, prev_move, output) {
  if (move[0] < 0 || move[1] < 0)
    return false;
  if (board[move[0]][move[1]] != ' ')
    return false;
  var c = tboard[(move[0] / 3 | 0) * 3 + 1][(move[1] / 3 | 0) * 3 + 1];
  if (c == 'X' || c == 'O' || c == 'T') {
    if (output)
      alert("Square already finished");
    return false;
  }
  if (prev_move) {
    var center = tboard[prev_move[0] % 3 * 3 + 1][prev_move[1] % 3 * 3 + 1];
    if ((center != 'X' && center != 'O' && center != '1' && center != '2') && (prev_move[0] % 3 != Math.floor(move[0] / 3) || prev_move[1] % 3 != Math.floor(move[1] / 3))) {
      if (output)
        alert("Wrong square!");
      return false;
    }
  }
  return true;
}

function set_turn(turn, move) {
  var color = x_turn_global ? 'X':'O';
  if (game_over(board, color, move))
    over = color;
  else if (tie_game(board))
    over = 'tie';
  
  x_turn_global = turn;
  prev_move = move;
  
  global_ROOT = MCTS_get_next_root(move);
  if (global_ROOT)
    global_ROOT.parent = null;
  else global_ROOT = create_MCTS_root();
  
//   var mtc = most_tried_child(global_ROOT, null);
  
//   if (!over && (turn === ai_turn || ai_turn == "both") && mtc && mtc.last_move)
//     draw_hover(mtc.last_move[0]);
//   else  draw_board();
  draw_board();
    
  if (over) {
    switch (over) {
      case "tie":
        alert("Game tied!");
        break;
      case 'X':
        alert("X wins!");
        break;
      case 'O':
        alert ("O wins!");
        break;
    }
    stop_ponder();
  }
  
  if (!over && (turn === ai_turn || ai_turn == "both"))
    setTimeout(play_ai_move, 25);
}

$('#board').mousedown(function (e) {
  if (e.which === 3)
    return;
  if (x_turn_global == ai_turn || ai_turn == "both")
    return;
  if (over) {
    alert("The game is already over!");
    return;
  }
  var move = get_move(e.pageX, e.pageY);
  if (!legal_move(board, move, prev_move, true))
    return;
  
  play_move(board, move, x_turn_global);
  
  set_turn(!x_turn_global, move);
  e.preventDefault();
});

function play_move(tboard, move, xturn) {
  var color = xturn ? 'x':'o';
  tboard[move[0]][move[1]] = color;
  var centerx = (move[0] / 3 | 0) * 3 + 1, centery = (move[1] / 3 | 0) * 3 + 1;
  var startx = (move[0] / 3 | 0) * 3, starty = (move[1] / 3 | 0) * 3;
  if (local_win(tboard, color, move, startx, starty))
    tboard[centerx][centery] = color.toUpperCase();
  else if (square_full(tboard, startx, starty))
    tboard[centerx][centery] = xturn ? '1':'2';
}

function local_win(tboard, color, move, startx, starty) {
  var i, a;
  
  for (var trial = 0; trial < 4; trial++) {
    cont:
    switch (trial) {
      case 0:
        for (i = startx; i < startx + 3; i++)
          if (tboard[i][move[1]] != color)
            break cont;
        return true;
      case 1:
        for (a = starty; a < starty + 3; a++)
          if (tboard[move[0]][a] != color)
            break cont;
        return true;
      case 2:
        if (move[0] % 3 != move[1] % 3)
          break;
        for (i = startx, a = starty; i < startx + 3; i++, a++)
          if (tboard[i][a] != color)
            break cont;
        return true;
      case 3:
        if (move[0] % 3 != 2 - move[1] % 3)
          break;
        for (i = startx, a = starty + 2; i < startx + 3; i++, a--)
          if (tboard[i][a] != color)
            break cont;
        return true;
    }
  }
  return false;
}

function square_full(tboard, startx, starty) {
  for (var i = startx; i < startx + 3; i++)
    for (var a = starty; a < starty + 3; a++)
      if (tboard[i][a] == ' ')
        return false;
  return true;
}

function game_over(tboard, color, m) {
  var i, a;
  var move = [(m[0] / 3 | 0) * 3 + 1, (m[1] / 3 | 0) * 3 + 1];
  
  for (var trial = 0; trial < 4; trial++) {
    cont:
    switch (trial) {
      case 0:
        for (i = 1; i < 9; i+=3)
          if (tboard[i][move[1]] != color)
            break cont;
        return true;
      case 1:
        for (a = 1; a < 9; a+=3)
          if (tboard[move[0]][a] != color)
            break cont;
        return true;
      case 2:
        if (Math.floor(move[0] / 3) != Math.floor(move[1] / 3))
          break;
        for (i = 1, a = 1; i < 9; i+=3, a+=3)
          if (tboard[i][a] != color)
            break cont;
        return true;
      case 3:
        if (Math.floor(move[0] / 3) != 2 - Math.floor(move[1] / 3))
          break;
        for (i = 1, a = 7; i < 9; i+=3, a-=3)
          if (tboard[i][a] != color)
            break cont;
        return true;
    }
  }
  return false;
}

function tie_game(tboard) {
  for (var i = 1; i < 9; i+=3)
    for (var a = 1; a < 9; a+=3)
      if (tboard[i][a] != '1' && tboard[i][a] != '2' && tboard[i][a] != 'O' && tboard[i][a] != 'X')
        return false;
  return true;
}

$('#board').mousemove(function (e) {
  if (x_turn_global == ai_turn || ai_turn == "both" || over)
    return;
  var move = get_move(e.pageX, e.pageY);
  if (legal_move(board, move, prev_move, false))
    draw_hover(move);
});

function update_analysis() {
  var range = get_MCTS_depth_range();
  $('#anal').text("Analysis: Best-" + range[1] +" Worst-" + range[0] + " Result-" + range[2]);
  $('#num-trials').text("Trials: " + global_ROOT.total_tries);
}

function start_ponder() {
  pondering = setInterval(function() {
    if (!global_ROOT)
      global_ROOT = create_MCTS_root();
    if (global_ROOT.total_tries < max_trials)
      for (var i = 0; i < monte_carlo_trials / 100; i++)
        global_ROOT.choose_child();
    update_analysis();
  }, 1);
}

function stop_ponder() {
  clearInterval(pondering);
}

function adjust_buttons() {
  $('.footer button').css('font-size', squarewidth / 4);
  $('.footer').css("height", squarewidth / 2);
  $('.footer').css('margin-bottom', squarewidth / 4 - $('#back').outerHeight(false));
  $('.footer #anal').css('line-height', squarewidth / 2 + "px");
  $('.footer #num-trials').css('line-height', squarewidth / 2 + "px");
}

function new_cookie_id() {
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var c_id;
  
  do {
    c_id = "";
    for( var i=0; i < 5; i++)
        c_id += possible.charAt(Math.floor(Math.random() * possible.length));
  } while (getCookie(c_id));
  
  return c_id;
}

function get_MCTS_depth_range() {
  var root, range = new Array(3);
  for (range[0] = -1, root = global_ROOT; root && root.children; range[0]++, root = least_tried_child(root));
  for (range[1] = -1, root = global_ROOT; root && root.children; range[1]++, root = most_tried_child(root));
  root = global_ROOT;
  if (root.total_tries > (root.hits + root.misses) * 2)
    range[2] = "Tie";
  else if ((root.hits > root.misses) == x_turn_global)
    range[2] = "X";
  else if ((root.hits < root.misses) == x_turn_global)
    range[2] = "O";
  else range[2] = "Tie";
  return range;
}

function setCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    var expires = "expires="+d.toUTCString();
    document.cookie = cname + "=" + cvalue + "; " + expires;
}

function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for(var i=0; i<ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1);
        if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
    }
    return "";
}

function MCTS_get_children(state, father) {
  var tboard = onetotwod(state.board);
  var turn = state.turn;
  var children = [];
  var i, a;
  
  if (state.game_over || tie_game(tboard))
    return [];
  
  if (father.last_move) {
    var next_center = [father.last_move[0] % 3 * 3 + 1, father.last_move[1] % 3 * 3 + 1];
    var next_center_color = tboard[next_center[0]][next_center[1]];
    if (next_center_color != 'X' && next_center_color != 'O' && next_center_color != '1' && next_center_color != '2') {
      for (i = next_center[0] - 1; i <= next_center[0] + 1; i++)
        for (a = next_center[1] - 1; a <= next_center[1] + 1; a++)
          if (tboard[i][a] == ' ') {
            play_move(tboard, [i, a], turn);
            children.push(new MCTS_Node(new State(twotooned(tboard), !turn), father, [i, a]));
            tboard = onetotwod(state.board);
          }
      return children;
    }
  }
  else {
    for (i = 0; i < 9; i++)
      for (a = 0; a < 9; a++) {
        tboard[i][a] = 'x';
        children.push(new MCTS_Node(new State(twotooned(tboard), !turn), father, [i, a]));
        tboard[i][a] = ' ';
      }
    return children;
  }

  for (var I = 1; I < 9; I+=3)
    for (var A = 1; A < 9; A+=3)
      if (tboard[I][A] != 'X' && tboard[I][A] != 'O' && tboard[I][A] != '1' && tboard[I][A] != '2')
        for (i = I-1; i <= I+1; i++)
          for (a = A-1; a <= A+1; a++)
            if (tboard[i][a] == ' ') {
              play_move(tboard, [i, a], turn);
              children.push(new MCTS_Node(new State(twotooned(tboard), !turn), father, [i, a]));
              tboard = onetotwod(state.board);
            }
  return children;
}

function MCTS_simulate(father) {
  var tboard = onetotwod(father.State.board);
  if (father.State.game_over || game_over(tboard, father.State.turn ? 'O':'X', father.last_move)) {
    father.State.game_over = true;
    return -1;
  }
  if (tie_game(tboard))
    return 0;
  
  var lm = father.last_move, turn = father.State.turn, done = false;
  var next_center, next_center_color;
  var x, y;
  while (!done) {
    next_center = [lm[0] % 3 * 3 + 1, lm[1] % 3 * 3 + 1];
    next_center_color = tboard[next_center[0]][next_center[1]];
    if (next_center_color != 'X' && next_center_color != 'O' && next_center_color != '1' && next_center_color != '2')
      do {
        x = next_center[0] - 1 + Math.random() * 3 | 0;
        y = next_center[1] - 1 + Math.random() * 3 | 0;
      }  while (tboard[x][y] != ' ');
    else do {
      x = Math.random() * 9 | 0;
      y = Math.random() * 9 | 0;
    }  while (!legal_move(tboard, [x, y], lm, false));
    play_move(tboard, [x, y], turn);
    done = game_over(tboard, turn ? 'X':'O', [x, y]);
    if (tie_game(tboard))
      return 0;
    lm = [x, y];
    turn = !turn;
  }
  if (turn === father.State.turn)
    return -1;
  return 1;
}

function onetotwod(oned) {
  var twod = new Array(9);
  for (var i = 0; i < 9; i++)
    twod[i] = oned.slice(i * 9, (i + 1) * 9);
  return twod;
}

function twotooned(twod) {
  var oned = new Array(81);
  for (var i = 0; i < 81; i++)
    oned[i] = twod[i / 9 | 0][i % 9];
  return oned;
}

function create_MCTS_root() {
  return new MCTS_Node(new State(twotooned(board), x_turn_global), null, prev_move);
}

function run_MCTS(time) {
  if (!global_ROOT)
    global_ROOT = create_MCTS_root();
  var start_time = new Date().getTime();
  while ((new Date().getTime() - start_time) / 1E3 < time) {
    for (var i = 0; i < 1000; i++)
      global_ROOT.choose_child();
    var error = get_certainty(global_ROOT);
    if (global_ROOT.children.length < 2 || error < certainty_threshold)
      return;
  }
}

function get_certainty(root) {
  var best_child = most_tried_child(root, null);
  var ratio = most_tried_child(root, best_child).total_tries / best_child.total_tries;
  var ratio_wins = best_child.hits < best_child.misses ? (best_child.hits / best_child.misses * 2):(best_child.misses / best_child.hits * 3);
  return ratio > ratio_wins ? ratio_wins:ratio;
}

function play_ai_move() {
//   ai_stopped = false;

  run_MCTS(time_to_think);
  fpaim();
}

function fpaim() {
  var best_move = get_best_move_MCTS();
  play_move(board, best_move, x_turn_global);
  set_turn(!x_turn_global, best_move);
}

function get_best_move_MCTS() {
  var best_child = most_tried_child(global_ROOT, null);
  if (!best_child)
    return -1;
  return best_child.last_move;
}

function most_tried_child(root, exclude) {
  var most_trials = 0, child = null;
  if (!root.children)
    return null;
  if (root.children.length == 1)
    return root.children[0];
  for (var i = 0; i < root.children.length; i++)
    if (root.children[i] != exclude && root.children[i].total_tries > most_trials) {
      most_trials = root.children[i].total_tries;
      child = root.children[i];
    }
  return child;
}

function least_tried_child(root) {
  var least_trials = root.total_tries + 1, child = null;
  if (!root.children)
    return null;
  for (var i = 0; i < root.children.length; i++)
    if (root.children[i].total_tries < least_trials) {
      least_trials = root.children[i].total_tries;
      child = root.children[i];
    }
  return child;
}

function MCTS_get_next_root(move) {
  if (!global_ROOT || !global_ROOT.children)
    return null;
  for (var i = 0; i < global_ROOT.children.length; i++)
    if (global_ROOT.children[i].last_move[0] == move[0] && global_ROOT.children[i].last_move[1] == move[1]) {
      return global_ROOT.children[i];
    }
  return null;
}

var State = function(board, turn) {
  this.board = board;
  this.turn = turn;
};

var MCTS_Node = function(State, parent, last_move) {
  this.State = State;
  this.parent = parent;
  this.last_move = last_move;
  this.hits = 0;
  this.misses = 0;
  this.total_tries = 0;
};

function MCTS_child_potential(child, t) {
  var w = child.misses - child.hits;
  var n = child.total_tries;
  var c = expansion_const;
  
  return w / n  +  c * Math.sqrt(Math.log(t) / n);
}

MCTS_Node.prototype.choose_child = function() {
  if (!this.children)
    this.children = MCTS_get_children(this.State, this);
  if (this.children.length === 0) // leaf node
    this.run_simulation();
  else {
    var i;
    var count_unexplored = 0;
    for (i = 0; i < this.children.length; i++)
      if (this.children[i].total_tries === 0)
        count_unexplored++;

    if (count_unexplored > 0) {
      var ran = Math.floor(Math.random() * count_unexplored);
      for (i = 0; i < this.children.length; i++)
        if (this.children[i].total_tries === 0) {
          count_unexplored--;
          if (count_unexplored === 0) {
            this.children[i].run_simulation();
            return;
          }
        }
      
    }
    else {
      var best_child = this.children[0], best_potential = MCTS_child_potential(this.children[0], this.total_tries), potential;
      for (i = 1; i < this.children.length; i++) {
        potential = MCTS_child_potential(this.children[i], this.total_tries);
        if (potential > best_potential) {
          best_potential = potential;
          best_child = this.children[i];
        }
      }
      best_child.choose_child();
    }
  }
};

MCTS_Node.prototype.run_simulation = function() {
  this.back_propogate(MCTS_simulate(this));
};

MCTS_Node.prototype.back_propogate = function(simulation) {
  if (simulation > 0)
    this.hits++;
  else if (simulation < 0)
    this.misses++;
  this.total_tries++;
  if (this.parent) {
    if (this.parent.State.turn === this.State.turn)
      this.parent.back_propogate(simulation);
    else this.parent.back_propogate(-simulation);
  }
};

function speed_test() {
  global_ROOT = create_MCTS_root();
  var total_trials, start = new Date().getTime();
  for (total_trials = 0; total_trials < 100000; total_trials++)
    global_ROOT.choose_child();
  console.log((new Date().getTime() - start) / 1E3);
}
