@main def tests(): Unit =
  Judge.check("여러 원소")(rebuild(List(1, 2, 3)), List(1, 2, 3))
  Judge.check("빈 리스트")(rebuild(Nil: List[Int]), Nil)
  Judge.check("문자열은 순서 유지")(rebuild(List("c", "a", "b")), List("c", "a", "b"))
  Judge.check("중첩 리스트")(rebuild(List(List(1), Nil, List(2, 3))), List(List(1), Nil, List(2, 3)))
  Judge.check("원소 하나")(rebuild(List(true)), List(true))
  Judge.check("자기 자신과 같은 값")({ val l = List(4, 5); rebuild(l) == l }, true)
