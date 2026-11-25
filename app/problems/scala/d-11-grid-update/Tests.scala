@main def tests(): Unit =
  Judge.check("처음엔 0")({ val g = Grid(3, 2); g(1, 2) }, 0)
  Judge.check("쓰고 읽기")({ val g = Grid(3, 2); g(1, 2) = 5; g(1, 2) }, 5)
  Judge.check("다른 칸은 그대로")({ val g = Grid(3, 2); g(0, 2) = 9; (g(1, 0), g(0, 2)) }, (0, 9))
  Judge.check("덮어쓰기")({ val g = Grid(2, 2); g(1, 1) = 1; g(1, 1) = 4; g(1, 1) }, 4)
  Judge.check("칸마다 독립")({ val g = Grid(2, 2); g(0, 1) = 1; g(1, 0) = 2; (g(0, 1), g(1, 0)) }, (1, 2))
