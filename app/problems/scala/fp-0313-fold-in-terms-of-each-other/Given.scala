enum List[+A]:
  case Nil
  case Cons(head: A, tail: List[A])

object List:
  def apply[A](as: A*): List[A] =
    if as.isEmpty then Nil else Cons(as.head, apply(as.tail*))

export List.{Nil, Cons}

def foldRight[A, B](as: List[A], z: B)(f: (A, B) => B): B = as match
  case Nil => z
  case Cons(h, t) => f(h, foldRight(t, z)(f))

@annotation.tailrec
def foldLeft[A, B](as: List[A], z: B)(f: (B, A) => B): B = as match
  case Nil => z
  case Cons(h, t) => foldLeft(t, f(z, h))(f)
