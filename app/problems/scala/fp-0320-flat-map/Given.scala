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

def append[A](a1: List[A], a2: List[A]): List[A] =
  foldRight(a1, a2)(Cons(_, _))

def concat[A](l: List[List[A]]): List[A] =
  foldRight(l, Nil: List[A])(append(_, _))

def map[A, B](as: List[A])(f: A => B): List[B] = as match
  case Nil => Nil
  case Cons(h, t) => Cons(f(h), map(t)(f))
