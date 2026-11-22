def setHead[A](l: List[A], h: A): List[A] = l match
  case Nil => Nil
  case Cons(_, t) => Cons(h, t)
