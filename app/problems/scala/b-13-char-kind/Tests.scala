@main def tests(): Unit =
  Judge.check("모음")(charKind('e'), "모음")
  Judge.check("자음")(charKind('z'), "자음")
  Judge.check("숫자")(charKind('7'), "숫자")
  Judge.check("기호")(charKind('!'), "기타")
  Judge.check("대문자는 기타")(charKind('A'), "기타")
  Judge.check("공백")(charKind(' '), "기타")
