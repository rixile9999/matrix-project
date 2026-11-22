@main def tests(): Unit =
  Judge.check("빈 문자열")(encode(""), Nil)
  Judge.check("한 글자")(encode("a"), List(('a', 1)))
  Judge.check("하나의 구간")(encode("zzzz"), List(('z', 4)))
  Judge.check("기본 예")(encode("aaabcc"), List(('a', 3), ('b', 1), ('c', 2)))
  Judge.check("모두 다름")(encode("abc"), List(('a', 1), ('b', 1), ('c', 1)))
  Judge.check("떨어진 같은 문자는 별개")(encode("aabbaa"), List(('a', 2), ('b', 2), ('a', 2)))
  Judge.check("공백과 숫자")(encode("11  2"), List(('1', 2), (' ', 2), ('2', 1)))
  Judge.check("긴 구간")(encode("x" * 50 + "y"), List(('x', 50), ('y', 1)))
