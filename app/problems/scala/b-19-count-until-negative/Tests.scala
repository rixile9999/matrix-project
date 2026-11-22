@main def tests(): Unit =
  Judge.check("빈 리스트")(countUntilNegative(Nil), 0)
  Judge.check("중간에 음수")(countUntilNegative(List(1, 2, -3, 4)), 2)
  Judge.check("첫 원소가 음수")(countUntilNegative(List(-1, 5)), 0)
  Judge.check("음수 없음, 0 포함")(countUntilNegative(List(0, 5, 7)), 3)
  Judge.check("음수가 둘")(countUntilNegative(List(3, -1, -2)), 1)
  Judge.check("뒤쪽 음수는 무시")(countUntilNegative(List(4, 4, 4, -1, 4, 4)), 3)
