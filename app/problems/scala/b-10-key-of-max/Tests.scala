@main def tests(): Unit =
  Judge.check("기본")(keyOfMax(Map("a" -> 3, "b" -> 9, "c" -> 5)), Some("b"))
  Judge.check("빈 Map")(keyOfMax(Map.empty[String, Int]), None)
  Judge.check("항목 하나")(keyOfMax(Map("q" -> 0)), Some("q"))
  Judge.check("음수만")(keyOfMax(Map("x" -> -5, "y" -> -2)), Some("y"))
