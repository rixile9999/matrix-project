@main def tests(): Unit =
  Judge.check("모두 Some")(sequence(List(Some(1), Some(2), Some(3))), Some(List(1, 2, 3)))
  Judge.check("빈 리스트")(sequence(List.empty[Option[Int]]), Some(Nil))
  Judge.check("중간에 None")(sequence(List(Some(1), None, Some(3))), None)
  Judge.check("처음이 None")(sequence(List(None: Option[Int], Some(2))), None)
  Judge.check("끝이 None")(sequence(List(Some(1), Some(2), None)), None)
  Judge.check("순서 유지")(sequence(List(Some("a"), Some("b"), Some("c"))), Some(List("a", "b", "c")))
  Judge.check("긴 리스트")(sequence(List.tabulate(1000)(i => Some(i))).map(_.length), Some(1000))
