def doublesToStrings(l: List[Double]): List[String] = l match
  case Nil => Nil
  case Cons(h, t) => Cons(h.toString, doublesToStrings(t))
