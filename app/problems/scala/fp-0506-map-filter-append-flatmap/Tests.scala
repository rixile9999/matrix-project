def nat(n: Int): Stream[Int] = Stream.cons(n, nat(n + 1))

@main def tests(): Unit =
  Judge.check("map: 기본")(Stream(1, 2, 3).map(_ * 2).toList, List(2, 4, 6))
  var calls = 0
  val mapped = nat(1).map { x => calls += 1; x * 2 }
  Judge.check("map: 무한 스트림이며 필요할 때만 함수를 호출")((calls, mapped.take(2).toList, calls), (0, List(2, 4), 2))
  Judge.check("filter: 기본")(Stream(1, 2, 3, 4, 5, 6).filter(_ % 2 == 0).toList, List(2, 4, 6))
  Judge.check("filter: 무한 스트림")(nat(1).filter(_ % 3 == 0).take(3).toList, List(3, 6, 9))
  Judge.check("append: 기본과 빈 스트림")((Stream(1, 2).append(Stream(3)).toList, Stream.empty[Int].append(Stream(1)).toList), (List(1, 2, 3), List(1)))
  Judge.check("append: 앞이 무한이면 뒤는 평가하지 않음")(nat(1).append(sys.error("뒤를 평가했다")).take(3).toList, List(1, 2, 3))
  Judge.check("flatMap: 빈 결과가 섞여도 이어 붙음")(Stream(1, 2, 3, 4).flatMap(n => if n % 2 == 0 then Stream(n, n * 10) else Stream.empty).toList, List(2, 20, 4, 40))
  Judge.check("flatMap: 무한 스트림")(nat(1).flatMap(n => Stream(n, -n)).take(4).toList, List(1, -1, 2, -2))
