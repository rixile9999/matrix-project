@main def tests(): Unit =
  val big = scala.List.range(0, 100000).foldRight(Nil: List[Int])(Cons(_, _))
  Judge.check("sumLeft")(sumLeft(List(1, 2, 3, 4)), 10)
  Judge.check("sumLeft 빈 리스트")(sumLeft(Nil), 0)
  Judge.check("productLeft")(productLeft(List(1.5, 2.0, 4.0)), 12.0)
  Judge.check("productLeft 빈 리스트")(productLeft(Nil), 1.0)
  Judge.check("lengthLeft")(lengthLeft(List("a", "b", "c")), 3)
  Judge.check("lengthLeft 빈 리스트")(lengthLeft(Nil), 0)
  Judge.check("10만 개에서도 안전")((sumLeft(big), lengthLeft(big)), (704982704, 100000))
