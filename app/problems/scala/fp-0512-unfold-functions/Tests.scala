def nat(n: Int): Stream[Int] = Stream.cons(n, nat(n + 1))

@main def tests(): Unit =
  Judge.check("map › 유한과 무한")((Stream(1, 2, 3).mapViaUnfold(_ + 1).toList, nat(1).mapViaUnfold(_ * 10).take(3).toList), (List(2, 3, 4), List(10, 20, 30)))
  Judge.check("take › 길이 초과와 무한")((Stream(1, 2).takeViaUnfold(5).toList, nat(1).takeViaUnfold(3).toList, Stream(1, 2).takeViaUnfold(0).toList), (List(1, 2), List(1, 2, 3), List.empty[Int]))
  Judge.check("takeWhile › 유한과 무한")((Stream(1, 2, 5, 1).takeWhileViaUnfold(_ < 3).toList, nat(1).takeWhileViaUnfold(_ < 4).toList), (List(1, 2), List(1, 2, 3)))
  Judge.check("zipWith › 짧은 쪽에서 끝남과 무한")((Stream(1, 2, 3).zipWithViaUnfold(Stream(10, 20))(_ + _).toList, nat(1).zipWithViaUnfold(Stream("a", "b", "c"))((n, s) => s * n).toList), (List(11, 22), List("a", "bb", "ccc")))
  Judge.check("zipAll › 왼쪽이 더 김")(Stream(1, 2, 3).zipAllViaUnfold(Stream("a")).toList, List((Some(1), Some("a")), (Some(2), None), (Some(3), None)))
  Judge.check("zipAll › 오른쪽이 더 김")(Stream(1).zipAllViaUnfold(Stream("a", "b")).toList, List((Some(1), Some("a")), (None, Some("b"))))
  Judge.check("zipAll › 둘 다 빈 경우와 한쪽만 빈 경우")((Stream.empty[Int].zipAllViaUnfold(Stream.empty[Int]).toList, Stream.empty[Int].zipAllViaUnfold(Stream(1)).toList), (List.empty[(Option[Int], Option[Int])], List((None, Some(1)))))
  Judge.check("zipAll › 무한과 유한")(nat(1).zipAllViaUnfold(Stream("a")).take(3).toList, List((Some(1), Some("a")), (Some(2), None), (Some(3), None)))
