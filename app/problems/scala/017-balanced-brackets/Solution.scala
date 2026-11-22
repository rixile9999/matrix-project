def balanced(s: String): Boolean =
  val result = s.foldLeft(Option(List.empty[Char])) { (acc, c) =>
    (acc, c) match
      case (Some(stack), '(' | '[' | '{') => Some(c :: stack)
      case (Some('(' :: rest), ')')       => Some(rest)
      case (Some('[' :: rest), ']')       => Some(rest)
      case (Some('{' :: rest), '}')       => Some(rest)
      case (Some(_), ')' | ']' | '}')     => None
      case (other, _)                     => other
  }
  result.contains(Nil)
