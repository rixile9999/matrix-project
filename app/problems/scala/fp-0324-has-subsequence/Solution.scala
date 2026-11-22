def startsWith[A](l: List[A], prefix: List[A]): Boolean = (l, prefix) match
  case (_, Nil) => true
  case (Cons(h1, t1), Cons(h2, t2)) if h1 == h2 => startsWith(t1, t2)
  case _ => false

@annotation.tailrec
def hasSubsequence[A](l: List[A], sub: List[A]): Boolean =
  if startsWith(l, sub) then true
  else l match
    case Nil => false
    case Cons(_, t) => hasSubsequence(t, sub)
