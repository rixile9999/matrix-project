@main def tests(): Unit =
  Judge.check("여러 원소")(tail(List(1, 2, 3)), List(2, 3))
  Judge.check("원소 하나")(tail(List(9)), Nil)
  Judge.check("빈 리스트는 Nil")(tail(Nil), Nil)
  Judge.check("문자열 리스트")(tail(List("a", "b")), List("b"))
  val l = List(1, 2, 3)
  val t = l match
    case Cons(_, t) => t
    case Nil => Nil
  Judge.check("꼬리를 복사하지 않고 공유한다")(tail(l) eq t, true)
  Judge.check("원본은 바뀌지 않는다")((tail(l), l), (List(2, 3), List(1, 2, 3)))
