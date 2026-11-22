def filter[A](as: List[A])(f: A => Boolean): List[A] = as match
  case Nil => Nil
  case Cons(h, t) if f(h) => Cons(h, filter(t)(f))
  case Cons(_, t) => filter(t)(f)

def removeOdds(l: List[Int]): List[Int] =
  filter(l)(_ % 2 == 0)
