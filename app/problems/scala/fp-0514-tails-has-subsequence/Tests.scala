def nat(n: Int): Stream[Int] = Stream.cons(n, nat(n + 1))

@main def tests(): Unit =
  Judge.check("tails › 기본")(Stream(1, 2, 3).tails.toList.map(_.toList), List(List(1, 2, 3), List(2, 3), List(3), List.empty[Int]))
  Judge.check("tails › 빈 스트림은 빈 스트림 하나")(Stream.empty[Int].tails.toList.map(_.toList), List(List.empty[Int]))
  Judge.check("tails › 무한 스트림의 앞부분")(nat(1).tails.take(3).toList.map(_.take(2).toList), List(List(1, 2), List(2, 3), List(3, 4)))
  Judge.check("hasSubsequence › 중간에 있음")(Stream(1, 2, 3, 4).hasSubsequence(Stream(2, 3)), true)
  Judge.check("hasSubsequence › 떨어져 있으면 거짓")(Stream(1, 2, 3, 4).hasSubsequence(Stream(1, 3)), false)
  Judge.check("hasSubsequence › 빈 sub와 더 긴 sub")((Stream(1, 2).hasSubsequence(Stream.empty), Stream(1, 2).hasSubsequence(Stream(1, 2, 3)), Stream.empty[Int].hasSubsequence(Stream.empty)), (true, false, true))
  Judge.check("hasSubsequence › 끝부분")(Stream(1, 2, 3, 4).hasSubsequence(Stream(3, 4)), true)
  Judge.check("hasSubsequence › 무한 스트림에서 찾으면 끝남")(nat(1).hasSubsequence(Stream(50, 51, 52)), true)
