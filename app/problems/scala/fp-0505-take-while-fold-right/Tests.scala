def nat(n: Int): Stream[Int] = Stream.cons(n, nat(n + 1))

@main def tests(): Unit =
  Judge.check("takeWhile › 앞쪽 연속 구간만 취함")(Stream(1, 2, 3, 1).takeWhile(_ < 3).toList, List(1, 2))
  Judge.check("takeWhile › 첫 원소부터 불만족이면 빈 스트림")(Stream(5, 1).takeWhile(_ < 3).toList, List.empty[Int])
  Judge.check("takeWhile › 무한 스트림")(nat(1).takeWhile(_ < 5).toList, List(1, 2, 3, 4))
  Judge.check("takeWhile › 항상 참이어도 필요한 만큼만 평가")(nat(1).takeWhile(_ => true).take(3).toList, List(1, 2, 3))
  Judge.check("takeWhile › 멈춘 지점 뒤의 꼬리는 평가하지 않음")(Stream.cons(1, Stream.cons(2, Stream.cons(3, sys.error("끝까지 읽었다")))).takeWhile(_ < 3).toList, List(1, 2))
  Judge.check("headOption › 빈 스트림")(Stream.empty[Int].headOption, None)
  Judge.check("headOption › 첫 원소")(Stream(7, 8).headOption, Some(7))
  Judge.check("headOption › 꼬리는 평가하지 않음")(Stream.cons(1, sys.error("꼬리를 평가했다")).headOption, Some(1))
