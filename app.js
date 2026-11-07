const BOARD_SIZE = 5;
const CPU_PLAYER = "B";   // CPU は後手。あなたは先手("A")
const CPU_DELAY_MS = 600; // CPU が指すまでの待ち時間(ミリ秒)

const els = {
  loading: document.getElementById("loading"),
  game: document.getElementById("game"),
  board: document.getElementById("board"),
  status: document.getElementById("status"),
  turnChip: document.getElementById("turn-chip"),
  btnUp: document.getElementById("btn-up"),
  btnDown: document.getElementById("btn-down"),
  btnLeft: document.getElementById("btn-left"),
  btnRight: document.getElementById("btn-right"),
  btnReset: document.getElementById("btn-reset"),
    modeBtns: document.querySelectorAll(".mode-btn"),
};

let pyodide = null;
let apiState = null;
let apiSelect = null;
let apiMove = null;
let apiReset = null;
let apiCpuMove = null;

// 対戦モード: "pvp"(2人で対戦) / "easy"(CPU弱い) / "normal"(CPU普通)
let mode = "pvp";
let cpuThinking = false; // CPU が考え中なら true(その間は操作できない)
let cpuTimer = null;     // CPU の待ち時間タイマー

async function boot() {
  pyodide = await loadPyodide();

  const res = await fetch("game_logic.py");
  const gameLogicSource = await res.text();
  pyodide.runPython(gameLogicSource);

  // JS から呼びやすいように、シンプルな関数群を Python 側に定義する
  pyodide.runPython(`
import json as _json

_game = Game()

def _api_state():
    board = []
    for r in range(BOARD_SIZE):
        row = []
        for c in range(BOARD_SIZE):
            piece = _game.piece_at(r, c)
            if piece is None:
                row.append(None)
            else:
                row.append({"player": piece.player, "parent": piece.is_parent})
        board.append(row)
    return _json.dumps({
        "board": board,
        "turn": _game.turn,
        "winner": _game.winner,
        "selected": list(_game.selected) if _game.selected else None,
    })

def _api_select(r, c):
    return _game.select(r, c)

def _api_move(direction):
    return _game.move(direction)

def _api_reset():
    _game.reset()


# ---------- ここから CPU ----------
import copy as _copy
import random as _random

def _simulate(game, pos, direction):
    # 盤面のコピーの上で試しに動かす(本物の _game は変わらない)
    g = _copy.deepcopy(game)
    g.select(pos[0], pos[1])
    g.move(direction)
    return g

def _choose_easy(game):
    # 弱い:指せる手からランダムに1つ
    moves = game.all_legal_moves(game.turn)
    if not moves:
        return None
    return _random.choice(moves)

def _choose_normal(game):
    # 普通:①勝てる手は指す ②相手にすぐ勝たれる手は避ける ③残りからランダム
    me = game.turn
    moves = game.all_legal_moves(me)
    if not moves:
        return None
    for pos, d in moves:
        if _simulate(game, pos, d).winner == me:
            return (pos, d)
    safe = []
    for pos, d in moves:
        after = _simulate(game, pos, d)
        opponent = after.turn
        opponent_can_win = False
        for opp_pos, opp_d in after.all_legal_moves(opponent):
            if _simulate(after, opp_pos, opp_d).winner == opponent:
                opponent_can_win = True
                break
        if not opponent_can_win:
            safe.append((pos, d))
    if safe:
        return _random.choice(safe)
    return _random.choice(moves)
# ---------- ここから 強いCPU ----------
_WIN = 10000

def _fast_copy(game):
    # deepcopy より速いコピー(駒そのものは書き換えないので、並びだけコピーすれば十分)
    g = Game.__new__(Game)
    g.board = [row[:] for row in game.board]
    g.turn = game.turn
    g.winner = game.winner
    g.selected = None
    return g

def _play(game, pos, d):
    # コピーの上で1手指した盤面を返す
    g = _fast_copy(game)
    g.select(pos[0], pos[1])
    g.move(d)
    return g

def _find_parent(game, player):
    # player の王コマの位置を探す
    for r in range(BOARD_SIZE):
        for c in range(BOARD_SIZE):
            p = game.board[r][c]
            if p is not None and p.player == player and p.is_parent:
                return (r, c)

def _win_chances(game, player):
    # player の王コマが「1手で中央に入れる方向」がいくつあるか
    r, c = _find_parent(game, player)
    count = 0
    for d in ("up", "down", "left", "right"):
        if game.compute_destination(r, c, d) == CENTER:
            count += 1
    return count

def _evaluate(game, player):
    # 盤面の点数(player から見て、大きいほど有利)
    opp = "B" if player == "A" else "A"
    mr, mc = _find_parent(game, player)
    orr, oc = _find_parent(game, opp)
    my_dist = abs(mr - 2) + abs(mc - 2)    # 自分の王コマと中央の距離
    opp_dist = abs(orr - 2) + abs(oc - 2)  # 相手の王コマと中央の距離
    chances = _win_chances(game, player) - _win_chances(game, opp)
    return (opp_dist - my_dist) + 5 * chances

def _negamax(game, depth, alpha, beta):
    # 今の手番の人から見た、この盤面の点数を depth 手先まで読んで返す
    me = game.turn
    if depth == 0:
        return _evaluate(game, me)
    moves = game.all_legal_moves(me)
    if not moves:
        return 0
    best = -_WIN * 10
    for pos, d in moves:
        child = _play(game, pos, d)
        if child.winner == me:
            return _WIN + depth  # すぐ勝てる(早く勝つほど高得点)
        score = -_negamax(child, depth - 1, -beta, -alpha)  # 相手の得は自分の損
        if score > best:
            best = score
        if best > alpha:
            alpha = best
        if alpha >= beta:
            break  # これ以上調べても結果が変わらないので打ち切り
    return best

def _choose_hard(game, depth=4):
    # 強い:depth 手先まで読んで、一番点数の高い手を選ぶ
    me = game.turn
    moves = game.all_legal_moves(me)
    if not moves:
        return None
    _random.shuffle(moves)  # 同じ点数の手があるとき、毎回同じ手にならないように
    best_move = moves[0]
    alpha = -_WIN * 10
    for pos, d in moves:
        child = _play(game, pos, d)
        if child.winner == me:
            return (pos, d)
        score = -_negamax(child, depth - 1, -_WIN * 10, -alpha)
        if score > alpha:
            alpha = score
            best_move = (pos, d)
    return best_move
def _api_cpu_move(level):
    if level == "hard":
        choice = _choose_hard(_game)
    elif level == "normal":
        choice = _choose_normal(_game)
    else:
        choice = _choose_easy(_game)
    if choice is None:
        return False
    (r, c), d = choice
    _game.select(r, c)
    return _game.move(d)
`);

  apiState = pyodide.globals.get("_api_state");
  apiSelect = pyodide.globals.get("_api_select");
  apiMove = pyodide.globals.get("_api_move");
  apiReset = pyodide.globals.get("_api_reset");
  apiCpuMove = pyodide.globals.get("_api_cpu_move");

  buildBoardCells();
  attachControlHandlers();

  els.loading.classList.add("hidden");
  els.game.classList.remove("hidden");

  render();
}

function buildBoardCells() {
  els.board.innerHTML = "";
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (r === 2 && c === 2) cell.classList.add("center");
      cell.addEventListener("click", () => onCellClick(r, c));
      els.board.appendChild(cell);
    }
  }
}

// 今が CPU の番かどうか
function isCpuTurn(state) {
  return mode !== "pvp" && state.turn === CPU_PLAYER && !state.winner;
}

function onCellClick(r, c) {
  const state = getState();
  if (state.winner || cpuThinking || isCpuTurn(state)) return;
  const piece = state.board[r][c];
  if (piece && piece.player === state.turn) {
    apiSelect(r, c);
    render();
  }
}

function attachControlHandlers() {
  els.btnUp.addEventListener("click", () => doMove("up"));
  els.btnDown.addEventListener("click", () => doMove("down"));
  els.btnLeft.addEventListener("click", () => doMove("left"));
  els.btnRight.addEventListener("click", () => doMove("right"));
  els.btnReset.addEventListener("click", resetGame);

  // モード切り替えボタン:押したらそのモードで最初から
  els.modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      els.modeBtns.forEach((b) => b.classList.toggle("active", b === btn));
      resetGame();
    });
  });
}

function resetGame() {
  clearTimeout(cpuTimer); // 考え中の CPU を止める
  cpuThinking = false;
  apiReset();
  render();
}

function doMove(direction) {
  const state = getState();
  if (state.selected === null || state.winner || cpuThinking) return;
  const moved = apiMove(direction);
  render();
  if (moved) startCpuTurnIfNeeded();
}

// あなたが指した後、CPU の番なら少し待ってから CPU に指させる
function startCpuTurnIfNeeded() {
  if (!isCpuTurn(getState())) return;
  cpuThinking = true;
  render();
  cpuTimer = setTimeout(() => {
    apiCpuMove(mode);
    cpuThinking = false;
    render();
  }, CPU_DELAY_MS);
}

// "A" / "B" を画面に出す名前に変える
function playerName(player) {
  if (mode === "pvp") return player === "A" ? "先手" : "後手";
  return player === CPU_PLAYER ? "CPU" : "あなた";
}
function getState() {
  return JSON.parse(apiState());
}

function render() {
  const state = getState();

  // 盤面
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = els.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      cell.innerHTML = "";
      cell.classList.remove("selected");

      const isSelected = state.selected && state.selected[0] === r && state.selected[1] === c;
      if (isSelected) cell.classList.add("selected");

      const piece = state.board[r][c];
      if (piece) {
        const dot = document.createElement("div");
        dot.className = "piece " + (piece.player === "A" ? "p1" : "p2");
        if (piece.parent) {
          const mark = document.createElement("div");
          mark.className = "king-mark";
          dot.appendChild(mark);
        }
        cell.appendChild(dot);
      }
    }
  }

  // ステータス表示
    els.turnChip.className = "turn-chip " + (state.turn === "A" ? "p1" : "p2");
   if (state.winner) {
    els.status.textContent = playerName(state.winner) + "の勝ち!";
  } else if (cpuThinking) {
    els.status.textContent = "CPUが考え中…";
  } else if (state.selected) {
    els.status.textContent = "方向を選んでください";
  } else {
    els.status.textContent = playerName(state.turn) + "の番です(駒をタップ)";
  }

  // 方向ボタンの有効/無効
  const controlsEnabled = !!state.selected && !state.winner && !cpuThinking;
  [els.btnUp, els.btnDown, els.btnLeft, els.btnRight].forEach((btn) => {
    btn.disabled = !controlsEnabled;
  });
}

boot();
