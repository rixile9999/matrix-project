@annotation.tailrec
def drop[A](l: List[A], n: Int): List[A] =
  if n <= 0 then l
  else l match
    case Nil => Nil
    case Cons(_, t) => drop(t, n - 1)
