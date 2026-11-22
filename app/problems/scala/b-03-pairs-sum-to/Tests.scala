@main def tests(): Unit =
  Judge.check("기본")(pairsSumTo(List(1, 2, 3, 4, 5), 5), List((1, 4), (2, 3)))
  Judge.check("같은 값 반복")(pairsSumTo(List(2, 2, 2), 4), List((2, 2), (2, 2), (2, 2)))
  Judge.check("빈 리스트")(pairsSumTo(Nil, 3), List.empty[(Int, Int)])
  Judge.check("원소 하나")(pairsSumTo(List(3), 6), List.empty[(Int, Int)])
  Judge.check("쌍 없음")(pairsSumTo(List(1, 2, 3), 10), List.empty[(Int, Int)])
