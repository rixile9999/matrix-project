@main def tests(): Unit =
  val big = scala.List.range(0, 100000).foldRight(Nil: List[Int])(Cons(_, _))
  Judge.check("합")(foldLeft(List(1, 2, 3, 4), 0)(_ + _), 10)
  Judge.check("빈 리스트는 z")(foldLeft(Nil: List[Int], 42)(_ + _), 42)
  Judge.check("뺄셈은 왼쪽부터 결합")(foldLeft(List(1, 2, 3), 10)(_ - _), 4)
  Judge.check("문자열은 원소를 뒤에 붙인다")(foldLeft(List("a", "b", "c"), "")(_ + _), "abc")
  Judge.check("Cons로 쌓으면 뒤집힌다")(foldLeft(List(1, 2, 3), Nil: List[Int])((acc, x) => Cons(x, acc)), List(3, 2, 1))
  Judge.check("결과 타입이 원소 타입과 다르다")(foldLeft(List("aa", "b"), 0)((n, s) => n + s.length), 3)
  Judge.check("10만 개에서도 스택 안전")(foldLeft(big, 0L)(_ + _), 4999950000L)
