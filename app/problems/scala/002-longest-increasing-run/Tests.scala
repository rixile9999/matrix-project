@main def tests(): Unit =
  Judge.check("빈 리스트")(longestRun(Nil), 0)
  Judge.check("원소 하나")(longestRun(List(7)), 1)
  Judge.check("전부 증가")(longestRun(List(1, 2, 3, 4)), 4)
  Judge.check("전부 감소")(longestRun(List(4, 3, 2, 1)), 1)
  Judge.check("같은 값은 증가가 아님")(longestRun(List(1, 2, 2, 3)), 2)
  Judge.check("가장 긴 구간이 중간")(longestRun(List(1, 3, 5, 2, 4, 6, 8, 10, 0, 1)), 5)
  Judge.check("가장 긴 구간이 끝")(longestRun(List(1, 2, 0, 1, 2, 3)), 4)
  Judge.check("음수")(longestRun(List(-3, -2, -1, -5)), 3)
