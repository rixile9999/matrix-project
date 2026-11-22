def tail[A](l: List[A]): List[A] = l match
  case Nil => Nil
  case Cons(_, t) => t
