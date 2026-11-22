def upTo(i: Int, n: Int): Stream[Int] =
  if i > n then Stream.empty else Stream.cons(i, upTo(i + 1, n))

@main def tests(): Unit =
  Judge.check("결과 › 합")(Stream(1, 2, 3).scanRight(0)(_ + _).toList, List(6, 5, 3, 0))
  Judge.check("결과 › 빈 스트림은 초기값 하나")(Stream.empty[Int].scanRight(7)(_ + _).toList, List(7))
  Judge.check("결과 › 원소 하나")(Stream(4).scanRight(1)(_ * _).toList, List(4, 1))
  Judge.check("결과 › 결과 타입이 달라짐")(Stream(1, 2, 3).scanRight("")((a, b) => a.toString + b).toList, List("123", "23", "3", ""))
  Judge.check("결과 › 결합이 오른쪽부터")(Stream(1, 2, 3).scanRight(List.empty[Int])((a, b) => a :: b).toList, List(List(1, 2, 3), List(2, 3), List(3), List.empty[Int]))
  Judge.check("결과 › 둘째 인자를 쓰지 않는 f")(Stream(1, 2, 3).scanRight(0)((a, _) => a * 10).toList, List(10, 20, 30, 0))
  var calls = 0
  val scanned = upTo(1, 1000).scanRight(0) { (a, b) => calls += 1; a + b }.toList
  Judge.check("효율 › 원소 천 개의 결과")((scanned.head, scanned.size), (500500, 1001))
  Judge.check("효율 › f는 원소마다 한 번만 호출")(calls, 1000)
