def charKind(c: Char): String = c match
  case 'a' | 'e' | 'i' | 'o' | 'u'   => "모음"
  case x if x >= 'a' && x <= 'z'      => "자음"
  case x if x.isDigit                 => "숫자"
  case _                              => "기타"
