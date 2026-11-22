@main def tests(): Unit =
  Judge.check("기본")(fieldCount("a,b,c"), 3)
  Judge.check("중간 빈 필드")(fieldCount("a,,c"), 3)
  Judge.check("끝 빈 필드")(fieldCount("a,b,,"), 4)
  Judge.check("쉼표 하나")(fieldCount(","), 2)
  Judge.check("빈 문자열")(fieldCount(""), 1)
