def init[A](l: List[A]): List[A] = l match
  case Nil => Nil
  case Cons(_, Nil) => Nil
  case Cons(h, t) => Cons(h, init(t))
