@main def tests(): Unit =
  Judge.check("여러 원소")(init(List(1, 2, 3, 4)), List(1, 2, 3))
  Judge.check("원소 둘")(init(List(1, 2)), List(1))
  Judge.check("원소 하나")(init(List(1)), Nil)
  Judge.check("빈 리스트")(init(Nil), Nil)
  Judge.check("문자열")(init(List("a", "b", "c")), List("a", "b"))
  Judge.check("중복 값이 있어도 마지막 하나만 뺀다")(init(List(2, 2, 2)), List(2, 2))
  Judge.check("원본은 바뀌지 않는다")({ val l = List(1, 2, 3); (init(l), l) }, (List(1, 2), List(1, 2, 3)))
