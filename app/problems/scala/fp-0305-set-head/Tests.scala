@main def tests(): Unit =
  Judge.check("여러 원소")(setHead(List(1, 2, 3), 9), List(9, 2, 3))
  Judge.check("원소 하나")(setHead(List(1), 7), List(7))
  Judge.check("빈 리스트는 Nil")(setHead(Nil: List[Int], 5), Nil)
  Judge.check("문자열")(setHead(List("a", "b"), "z"), List("z", "b"))
  val l = List(1, 2, 3)
  val t = l match
    case Cons(_, t) => t
    case Nil => Nil
  Judge.check("꼬리를 공유한다")(setHead(l, 0) match { case Cons(_, t2) => t2 eq t; case Nil => false }, true)
  Judge.check("원본은 바뀌지 않는다")((setHead(l, 0), l), (List(0, 2, 3), List(1, 2, 3)))
