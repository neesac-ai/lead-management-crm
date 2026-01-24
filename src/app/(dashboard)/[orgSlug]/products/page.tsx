'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  Package,
  Loader2,
  ExternalLink,
  Pencil,
  Trash2,
  Image as ImageIcon,
  Video,
  Lightbulb,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { Product, User } from '@/types/database.types'
import { getMenuNames, getMenuLabel } from '@/lib/menu-names'

interface ProductFormData {
  name: string
  description: string
  pitch_points: string[]
  images: string[]
  demo_link: string
}

const emptyFormData: ProductFormData = {
  name: '',
  description: '',
  pitch_points: [''],
  images: [''],
  demo_link: ''
}

export default function ProductsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  const [products, setProducts] = useState<Product[]>([])
  const [userProfile, setUserProfile] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState<ProductFormData>(emptyFormData)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin'

  useEffect(() => {
    fetchData()
    fetchMenuNames()
  }, [orgSlug])

  // Fetch menu names
  const fetchMenuNames = async () => {
    try {
      const names = await getMenuNames()
      setMenuNames(names)
    } catch (error) {
      console.error('Error fetching menu names:', error)
    }
  }

  // Listen for menu name updates
  useEffect(() => {
    const handleMenuNamesUpdate = () => {
      fetchMenuNames()
    }
    window.addEventListener('menu-names-updated', handleMenuNamesUpdate)
    return () => {
      window.removeEventListener('menu-names-updated', handleMenuNamesUpdate)
    }
  }, [])

  async function fetchData() {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', user.id)
        .single()

      if (!profile) return
      setUserProfile(profile)

      // Get organization
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()

      if (!orgData) return

      // Fetch products
      const { data: productsData, error } = await supabase
        .from('products')
        .select('*')
        .eq('org_id', orgData.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching products:', error)
      } else {
        setProducts(productsData || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  function openAddDialog() {
    setEditingProduct(null)
    setFormData(emptyFormData)
    setIsDialogOpen(true)
  }

  function openEditDialog(product: Product) {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      description: product.description || '',
      pitch_points: product.pitch_points?.length ? product.pitch_points : [''],
      images: product.images?.length ? product.images : [''],
      demo_link: product.demo_link || ''
    })
    setIsDialogOpen(true)
  }

  function addPitchPoint() {
    setFormData({ ...formData, pitch_points: [...formData.pitch_points, ''] })
  }

  function removePitchPoint(index: number) {
    const updated = formData.pitch_points.filter((_, i) => i !== index)
    setFormData({ ...formData, pitch_points: updated.length ? updated : [''] })
  }

  function updatePitchPoint(index: number, value: string) {
    const updated = [...formData.pitch_points]
    updated[index] = value
    setFormData({ ...formData, pitch_points: updated })
  }

  function addImage() {
    setFormData({ ...formData, images: [...formData.images, ''] })
  }

  function removeImage(index: number) {
    const updated = formData.images.filter((_, i) => i !== index)
    setFormData({ ...formData, images: updated.length ? updated : [''] })
  }

  function updateImage(index: number, value: string) {
    const updated = [...formData.images]
    updated[index] = value
    setFormData({ ...formData, images: updated })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error('Product name is required')
      return
    }

    setIsSaving(true)

    try {
      // Get org ID
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()

      if (!orgData) {
        toast.error('Organization not found')
        return
      }

      // Filter out empty values
      const pitchPoints = formData.pitch_points.filter(p => p.trim())
      const images = formData.images.filter(i => i.trim())

      const productData = {
        org_id: orgData.id,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        pitch_points: pitchPoints.length ? pitchPoints : null,
        images: images.length ? images : null,
        demo_link: formData.demo_link.trim() || null,
        updated_at: new Date().toISOString()
      }

      if (editingProduct) {
        // Update existing product
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)

        if (error) throw error
        toast.success('Product updated successfully')
      } else {
        // Create new product
        const { error } = await supabase
          .from('products')
          .insert(productData)

        if (error) throw error
        toast.success('Product created successfully')
      }

      setIsDialogOpen(false)
      setFormData(emptyFormData)
      setEditingProduct(null)
      fetchData()
    } catch (error) {
      console.error('Error saving product:', error)
      toast.error('Failed to save product')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(productId: string) {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', productId)

      if (error) throw error
      toast.success('Product deleted successfully')
      fetchData()
    } catch (error) {
      console.error('Error deleting product:', error)
      toast.error('Failed to delete product')
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <Header
        title="Products & Services"
        description={isAdmin ? "Manage your product catalog" : "View available products"}
      />

      <div className="flex-1 p-4 lg:p-6">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Products
              </CardTitle>
              <CardDescription>
                {isAdmin
                  ? 'Add products with descriptions, pitch points, and demo links'
                  : 'Browse products to discuss with leads'
                }
              </CardDescription>
            </div>
            {isAdmin && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={openAddDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <form onSubmit={handleSubmit}>
                    <DialogHeader>
                      <DialogTitle>
                        {editingProduct ? 'Edit Product' : 'Add New Product'}
                      </DialogTitle>
                      <DialogDescription>
                        Enter product details below
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {/* Name */}
                      <div className="space-y-2">
                        <Label htmlFor="name">Product Name *</Label>
                        <Input
                          id="name"
                          placeholder="e.g., Premium CRM Suite"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                        />
                      </div>

                      {/* Description */}
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          placeholder="Describe your product..."
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          rows={3}
                        />
                      </div>

                      {/* Pitch Points */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4" />
                          Pitch Points / Selling Points
                        </Label>
                        {formData.pitch_points.map((point, index) => (
                          <div key={index} className="flex gap-2">
                            <Input
                              placeholder={`Point ${index + 1}: e.g., 24/7 Customer Support`}
                              value={point}
                              onChange={(e) => updatePitchPoint(index, e.target.value)}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removePitchPoint(index)}
                              disabled={formData.pitch_points.length === 1}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addPitchPoint}>
                          <Plus className="h-4 w-4 mr-1" /> Add Point
                        </Button>
                      </div>

                      {/* Demo Link */}
                      <div className="space-y-2">
                        <Label htmlFor="demo_link" className="flex items-center gap-2">
                          <Video className="h-4 w-4" />
                          Demo Link
                        </Label>
                        <Input
                          id="demo_link"
                          type="url"
                          placeholder="https://youtube.com/... or https://yoursite.com/demo"
                          value={formData.demo_link}
                          onChange={(e) => setFormData({ ...formData, demo_link: e.target.value })}
                        />
                      </div>

                      {/* Images */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          Image URLs
                        </Label>
                        {formData.images.map((image, index) => (
                          <div key={index} className="flex gap-2">
                            <Input
                              type="url"
                              placeholder={`Image ${index + 1} URL`}
                              value={image}
                              onChange={(e) => updateImage(index, e.target.value)}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeImage(index)}
                              disabled={formData.images.length === 1}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addImage}>
                          <Plus className="h-4 w-4 mr-1" /> Add Image
                        </Button>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : editingProduct ? 'Update Product' : 'Add Product'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {products.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No products yet</p>
                {isAdmin && <p className="text-sm">Add your first product to get started</p>}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <Card
                    key={product.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedProduct(product)}
                  >
                    <CardContent className="p-4">
                      {/* Product Image */}
                      {product.images && product.images[0] && (
                        <div className="aspect-video mb-3 rounded-lg overflow-hidden bg-muted">
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        </div>
                      )}

                      <h3 className="font-semibold text-lg mb-1">{product.name}</h3>

                      {product.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {product.description}
                        </p>
                      )}

                      {product.pitch_points && product.pitch_points.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          <Badge variant="secondary" className="text-xs">
                            {product.pitch_points.length} pitch points
                          </Badge>
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        {product.demo_link ? (
                          <a
                            href={product.demo_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                          >
                            <Video className="h-3 w-3" />
                            View Demo
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">No demo</span>
                        )}

                        {isAdmin && (
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(product)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Product</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete &quot;{product.name}&quot;? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-red-500 hover:bg-red-600"
                                    onClick={() => handleDelete(product.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Detail Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  {selectedProduct.name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Images Gallery */}
                {selectedProduct.images && selectedProduct.images.length > 0 && (
                  <div className="space-y-2">
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                      <img
                        src={selectedProduct.images[0]}
                        alt={selectedProduct.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    </div>
                    {selectedProduct.images.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto">
                        {selectedProduct.images.slice(1).map((img, idx) => (
                          <img
                            key={idx}
                            src={img}
                            alt={`${selectedProduct.name} ${idx + 2}`}
                            className="w-20 h-20 rounded object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Description */}
                {selectedProduct.description && (
                  <div>
                    <h4 className="font-medium mb-1">Description</h4>
                    <p className="text-muted-foreground">{selectedProduct.description}</p>
                  </div>
                )}

                {/* Pitch Points */}
                {selectedProduct.pitch_points && selectedProduct.pitch_points.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      Pitch Points
                    </h4>
                    <ul className="space-y-2">
                      {selectedProduct.pitch_points.map((point, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-primary font-bold">•</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Demo Link */}
                {selectedProduct.demo_link && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Demo
                    </h4>
                    <a
                      href={selectedProduct.demo_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-primary hover:underline"
                    >
                      Watch Demo
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}







