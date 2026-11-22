def fold[A, B](t: Tree[A])(f: A => B)(g: (B, B) => B): B = t match
  case Leaf(v) => f(v)
  case Branch(l, r) => g(fold(l)(f)(g), fold(r)(f)(g))

def sizeViaFold[A](t: Tree[A]): Int =
  fold(t)(_ => 1)(1 + _ + _)

def maximumViaFold(t: Tree[Int]): Int =
  fold(t)(x => x)(_.max(_))

def depthViaFold[A](t: Tree[A]): Int =
  fold(t)(_ => 0)((a, b) => 1 + a.max(b))

def mapViaFold[A, B](t: Tree[A])(f: A => B): Tree[B] =
  fold(t)(a => Leaf(f(a)): Tree[B])(Branch(_, _))
