@main def tests(): Unit =
  Judge.check("기본")(wordCount(List("a", "b", "a", "c", "a")), Map("a" -> 3, "b" -> 1, "c" -> 1))
  Judge.check("빈 리스트")(wordCount(Nil), Map.empty[String, Int])
  Judge.check("모두 다름")(wordCount(List("x", "y")), Map("x" -> 1, "y" -> 1))
  Judge.check("모두 같음")(wordCount(List("z", "z")), Map("z" -> 2))
