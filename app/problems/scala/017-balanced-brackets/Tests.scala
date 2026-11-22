@main def tests(): Unit =
  Judge.check("빈 문자열")(balanced(""), true)
  Judge.check("세 종류 중첩")(balanced("([]{})"), true)
  Judge.check("괄호 외 문자 무시")(balanced("a(b)c"), true)
  Judge.check("종류가 다름")(balanced("(]"), false)
  Judge.check("닫는 괄호가 모자람")(balanced("(()"), false)
  Judge.check("닫는 괄호가 넘침")(balanced("())"), false)
  Judge.check("순서가 엇갈림")(balanced("([)]"), false)
  Judge.check("오류 뒤에 짝이 맞아도 실패")(balanced("]()"), false)
