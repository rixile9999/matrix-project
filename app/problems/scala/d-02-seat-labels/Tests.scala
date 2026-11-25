@main def tests(): Unit =
  Judge.check("기본")(seats(List(1, 2), List('A', 'B')), List("1A", "1B", "2A", "2B"))
  Judge.check("행 우선 순서")(seats(List(3, 1), List('C', 'A', 'B')), List("3C", "3A", "3B", "1C", "1A", "1B"))
  Judge.check("행이 없으면 빈 목록")(seats(Nil, List('A')), List.empty[String])
  Judge.check("열이 없으면 빈 목록")(seats(List(1, 2), Nil), List.empty[String])
