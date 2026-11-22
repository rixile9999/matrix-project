@main def tests(): Unit =
  Judge.check("같은 길이")(addCorresponding(List(1, 2, 3), List(4, 5, 6)), List(5, 7, 9))
  Judge.check("둘 다 빈 리스트")(addCorresponding(Nil, Nil), Nil)
  Judge.check("앞이 더 짧음")(addCorresponding(List(1, 2), List(10, 20, 30)), List(11, 22))
  Judge.check("뒤가 더 짧음")(addCorresponding(List(1, 2, 3), List(10)), List(11))
  Judge.check("한쪽이 빈 리스트")(addCorresponding(List(1, 2), Nil), Nil)
  Judge.check("음수")(addCorresponding(List(-1, 5), List(1, -5)), List(0, 0))
