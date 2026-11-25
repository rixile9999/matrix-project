case class P(n: Int)
@main def tests(): Unit =
  Judge.check("Int")(smallest(List(3, 1, 2)), Some(1))
  Judge.check("문자열")(smallest(List("pear", "apple", "fig")), Some("apple"))
  Judge.check("빈 리스트")(smallest(List.empty[Int]), None)
  Judge.check("원소 하나")(smallest(List(7)), Some(7))
  given Ordering[P] = Ordering.by(p => -p.n)
  Judge.check("사용자 순서를 따른다")(smallest(List(P(1), P(5), P(3))), Some(P(5)))
