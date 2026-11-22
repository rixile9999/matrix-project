@main def tests(): Unit =
  val big = scala.List.range(0, 100000).foldRight(Nil: List[Int])(Cons(_, _))
  Judge.check("여러 원소")(reverse(List(1, 2, 3)), List(3, 2, 1))
  Judge.check("빈 리스트")(reverse(Nil: List[Int]), Nil)
  Judge.check("원소 하나")(reverse(List("a")), List("a"))
  Judge.check("문자열")(reverse(List("a", "b", "c", "d")), List("d", "c", "b", "a"))
  Judge.check("두 번 뒤집으면 원래대로")(reverse(reverse(List(1, 2, 3, 4))), List(1, 2, 3, 4))
  Judge.check("중복 값")(reverse(List(1, 1, 2)), List(2, 1, 1))
  Judge.check("10만 개에서도 안전하고 빠르다")(reverse(big) match { case Cons(h, _) => h; case Nil => -1 }, 99999)
