@main def tests(): Unit =
  Judge.check("둘 다 일치")(bothMatch("a.*", ".*c", "abc"), Some(true))
  Judge.check("하나만 일치")(bothMatch("a.*", "x.*", "abc"), Some(false))
  Judge.check("둘 다 불일치")(bothMatch("x", "y", "abc"), Some(false))
  Judge.check("첫 정규식이 잘못됨")(bothMatch("(", "a", "a"), None)
  Judge.check("둘째 정규식이 잘못됨")(bothMatch("a", "[", "a"), None)
  Judge.check("전체 일치만 인정")(bothMatch("a", "a", "ab"), Some(false))
