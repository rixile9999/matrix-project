@main def tests(): Unit =
  Judge.check("기본")(cheapPairs(List(1, 2, 3, 4), 5), List((2, 3), (3, 4), (4, 5), (6, 5)))
  Judge.check("예산이 넉넉하면 a < b 인 모든 쌍")(cheapPairs(List(1, 2, 3), 100), List((2, 3), (3, 4), (6, 5)))
  Judge.check("같은 값끼리는 쌍이 아니다")(cheapPairs(List(3, 3, 3), 100), List.empty[(Int, Int)])
  Judge.check("순서는 바깥 a, 안쪽 b")(cheapPairs(List(2, 1, 3), 100), List((6, 5), (2, 3), (3, 4)))
  Judge.check("예산 초과는 제외")(cheapPairs(List(5, 6), 10), List.empty[(Int, Int)])
