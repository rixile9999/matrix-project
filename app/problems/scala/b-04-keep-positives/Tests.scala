@main def tests(): Unit =
  Judge.check("뒤에도 양수가 있음")(positives(List(3, -1, 4, 0, 5)), List(3, 4, 5))
  Judge.check("맨 앞이 음수")(positives(List(-5, 7)), List(7))
  Judge.check("전부 양수")(positives(List(1, 2)), List(1, 2))
  Judge.check("전부 음수")(positives(List(-1, -2)), List.empty[Int])
  Judge.check("빈 리스트")(positives(Nil), List.empty[Int])
