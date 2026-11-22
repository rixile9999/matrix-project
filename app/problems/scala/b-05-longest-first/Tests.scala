@main def tests(): Unit =
  Judge.check("기본")(longestFirst(List("aa", "b", "cccc", "dd")), List("cccc", "aa", "dd", "b"))
  Judge.check("길이가 모두 같음")(longestFirst(List("x", "y", "z")), List("x", "y", "z"))
  Judge.check("이미 긴 순서")(longestFirst(List("abc", "ab", "a")), List("abc", "ab", "a"))
  Judge.check("빈 리스트")(longestFirst(Nil), List.empty[String])
