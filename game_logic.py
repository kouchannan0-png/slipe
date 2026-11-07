"""
ミニゲーム ゲームロジック
Kivy に依存しない純粋な Python 実装。
UI 層(main.py)からはこのモジュールの Game クラスだけを使う。
"""

from dataclasses import dataclass
from typing import Optional, List, Tuple

BOARD_SIZE = 5
CENTER = (2, 2)

# 方向定義: (dr, dc)
UP = (-1, 0)
DOWN = (1, 0)
LEFT = (0, -1)
RIGHT = (0, 1)
DIRECTIONS = {"up": UP, "down": DOWN, "left": LEFT, "right": RIGHT}


@dataclass
class Piece:
    player: str  # "A" or "B"
    is_parent: bool

    def label(self) -> str:
        """AI用の盤面表現(A/a, B/b)を返す"""
        ch = self.player
        return ch.lower() if self.is_parent else ch


class Game:
    """ミニゲーム の対局状態を管理するクラス"""

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.board: List[List[Optional[Piece]]] = [
            [None for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)
        ]
        for c in range(BOARD_SIZE):
            self.board[0][c] = Piece(player="A", is_parent=(c == 2))
            self.board[BOARD_SIZE - 1][c] = Piece(player="B", is_parent=(c == 2))
        self.turn: str = "A"
        self.winner: Optional[str] = None
        self.selected: Optional[Tuple[int, int]] = None

    def other_player(self) -> str:
        return "B" if self.turn == "A" else "A"

    def piece_at(self, r: int, c: int) -> Optional[Piece]:
        return self.board[r][c]

    def select(self, r: int, c: int) -> bool:
        """
        自分の駒を選択する。選択に成功したら True。
        既にゲームが終わっている、または相手の駒/空マスを選んだ場合は False。
        """
        if self.winner is not None:
            return False
        piece = self.piece_at(r, c)
        if piece is None or piece.player != self.turn:
            return False
        self.selected = (r, c)
        return True

    def clear_selection(self) -> None:
        self.selected = None

    def compute_destination(
        self, r: int, c: int, direction: str
    ) -> Tuple[int, int]:
        """
        指定位置の駒を direction 方向へ滑らせたときの
        最終停止位置 (r, c) を計算する。移動できない場合は元の位置を返す。
        """
        dr, dc = DIRECTIONS[direction]
        nr, nc = r, c
        while True:
            tr, tc = nr + dr, nc + dc
            if not (0 <= tr < BOARD_SIZE and 0 <= tc < BOARD_SIZE):
                break
            if self.board[tr][tc] is not None:
                break
            nr, nc = tr, tc
        return nr, nc

    def move(self, direction: str) -> bool:
        """
        選択中の駒を direction 方向に動かす。
        移動が成立した(=位置が変わった)場合 True を返す。
        勝利条件を満たした場合は self.winner をセットする。
        """
        if self.winner is not None or self.selected is None:
            return False

        r, c = self.selected
        piece = self.board[r][c]
        dest_r, dest_c = self.compute_destination(r, c, direction)

        if (dest_r, dest_c) == (r, c):
            # 隣が壁 or 駒で動けない
            return False

        self.board[r][c] = None
        self.board[dest_r][dest_c] = piece
        self.selected = None

        if (dest_r, dest_c) == CENTER and piece.is_parent:
            self.winner = piece.player
            return True

        self.turn = self.other_player()
        return True

    def legal_directions_from(self, r: int, c: int) -> List[str]:
        """そのマスの駒が実際に動ける方向のリストを返す(壁で0マス移動は除外)"""
        result = []
        for name in DIRECTIONS:
            dest = self.compute_destination(r, c, name)
            if dest != (r, c):
                result.append(name)
        return result

    def all_legal_moves(self, player: str) -> List[Tuple[Tuple[int, int], str]]:
        """player が指せる (座標, 方向) の全リストを返す(CPU AI用)"""
        moves = []
        for r in range(BOARD_SIZE):
            for c in range(BOARD_SIZE):
                piece = self.board[r][c]
                if piece is not None and piece.player == player:
                    for d in self.legal_directions_from(r, c):
                        moves.append(((r, c), d))
        return moves

    def board_repr(self) -> str:
        """デバッグ/AI用のテキスト表現"""
        rows = []
        for r in range(BOARD_SIZE):
            row = []
            for c in range(BOARD_SIZE):
                piece = self.board[r][c]
                if piece is None:
                    row.append("G" if (r, c) == CENTER else "0")
                else:
                    row.append(piece.label())
            rows.append(" ".join(row))
        return "\n".join(rows)
